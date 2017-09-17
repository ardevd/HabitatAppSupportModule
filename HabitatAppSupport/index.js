/* Habitat App Support
 *
 * 2017
 */
function HabitatAppSupport (id, controller) {
    HabitatAppSupport.super_.call(this, id, controller);

    var self = this;

    self.DB_NAME        = "HabitatAppSupport";
    self.DB_TABLE_APP   = "HabitatAppSupport_App_v100";  // filename

    self.ANDROID = "android";

    // stores object references of callback functions for removing event listener
    self.deviceUpdatesCallbackWrapper = {};
    self.notificationUpdatesCallbackWrapper = {};
}

inherits(HabitatAppSupport, AutomationModule);

_module = HabitatAppSupport;

HabitatAppSupport.prototype.init = function (config) {
    HabitatAppSupport.super_.prototype.init.call(this, config);

    var self = this;

	var vDev = self.controller.devices.create({
        deviceId: 'HabitatAppSupport',
        defaults: {
            metrics: {
                title: 'Habitat App Support',
                text: '',
            }
        },
        overlay: {
            deviceType: 'text',
            permanently_hidden: true,
            visibility: false,
            metrics: {
                title: 'Habitat App Support',
				icon: "/ZAutomation/api/v1/load/modulemedia/HabitatAppSupport/icon.png"
			}
        },
        handler: function (command, args) {
            /*
             * 1 - OK
             * 2 - Missing parameters
             * 3 - App doesn't exist
             */
            if (command === "registerApp") {
                if (args.token && args.hubId && args.title && args.os) {
                    var app = self.generateApp(args.token, args.hubId, args.title, args.os);
                    var status = self.registerApp(app);
                    if(status === 1) {
                        console.log("(Habitat App Support) App registered: " + app.title);

                        // create virtual device for phone
                        self.createHabitatAppSupportPhone(app.token, app.hubId, app.title, app.os);

                        return { 'code': 1, 'message': 'OK' }
                    } else if(status === 0) {
                        // update title
                        self.updateApp(app);

                        console.log("(Habitat App Support) App updated: " + app.title);
                        return { 'code': 1, 'message': 'OK' }
                    }
                } else {
                    return { 'code': 2, 'message': 'Error - missing parameter' }
                }
			} else if (command === "updateActiveState") {
                if (args.token && args.active) {
                    var app = self.getApp(args.token);

                    if (app) {
                        app.active = args.active;
                        self.updateApp(app);

                        console.log("(Habitat App Support) App active state updated: " + app.title);
                        return { 'code': 1, 'message': 'OK' }
                    } else {
                        console.log("(Habitat App Support) Update active state: app doesn't exist");
                        return { 'code': 3, 'message': "Update active state: app doesn't exist" }
                    }
                } else {
                    return { 'code': 2, 'message': 'Error - missing parameter' }
                }
            } else if(command === "removeApp") {
                if(args.token) {
                    var app = self.removeApp(args.token);
                    if(app) {
                        console.log('(Habitat App Support) App removed: ' + app.title);
                        return { 'code': 1, 'message': 'OK' }
                    } else {
                        console.log('(Habitat App Support) Remove app failed: app not found');
                        return { 'code': 3, 'message': "Remove app failed: app doesn't exist" }
                    }
                } else {
                    return { 'code': 2, 'message': 'Error - missing parameter' }
                }
			} else if(command === "state") {
                var app = loadObject(self.DB_TABLE_APP);

                return {
                    'code': 1,
                    'message': 'OK',
                    'state': {
                        'app': app
                    }
                }
			} else if(command === "clearAll") {
                var appData = self.getAllApp();

                appData.forEach(function(it) {
                    self.removeApp(it.token);

                    console.log('(Habitat App Support) Remove all: ' + self.toStringApp(it));
                });
			} else if(command === "clearOne") {
                /* remove phoneApp data */
                self.getAllApp().forEach(function(it) {
                    if(it.title === args.title) {
                        self.removeApp(it.token);
                    }
                });
                /* remove phone vDev */
                self.controller.devices.remove(args.id);
                /* remove from current configuration page */
                self.config.phones.table = self.config.phones.table.filter(function(p) {
                    return p.phones_title !== args.title
                });

                return {
                    'code': 1,
                    'message': 'OK'
                }
            } else if(command === "setConnection") {
                console.log("setConnection", JSON.stringify(args));

                var vDevId = 'Phone-' + args.name + '-0-presence',
                    ret = {
                        'code': 1,
                        'message': 'OK'
                    }

                vDev  = self.controller.devices.get(vDevId);
                if(vDev) {
                    vDev.set('metrics:currentScene', args.connection);
                    vDev.set('metrics:level', args.connection);
                } else {
                    ret.code = 2;
                    ret.message = "Error - Device not found";
                }
                return ret;
            }
        },
        moduleId: self.id
    });

    // create phone devices if app or server restart
    var appData = self.getAllApp();

    if (appData) {
        appData.forEach(function(it) {
            self.createHabitatAppSupportPhone(it.token, it.hubId, it.title, it.os);
        });
    }

    // device state updates only for android
    // wrap method with a function
    self.deviceUpdatesCallbackWrapper = function(device) {
        // workaround for unaccessible properties
        var deviceCopy = JSON.parse(JSON.stringify(device));

        if (deviceCopy.permanently_hidden === false && deviceCopy.visibility === true) {
            var appData = self.getAllApp();

            appData.forEach(function(it) {
                if (it.active === "1" && it.os === self.ANDROID) {
                    console.log("(Habitat App Support) Notify listener (DeviceUpdate): " + deviceCopy.metrics.title + " - " + deviceCopy.metrics.level);

                    var message = {
                        to: it.token,
                        time_to_live: 172800,
                        data: {
                            type: "device:change:metrics:level",
                            data: device,
                            hubId: it.hubId
                        }
                    };

                    self.notifyListener(device, it.token, "device:change:metrics:level");
                }
            });
        } else {
            console.log("(Habitat App Support) Notify listener (DeviceUpdate) skipped");
        }
    };
    self.controller.devices.on('change:metrics:level', self.deviceUpdatesCallbackWrapper);

    // wrap method with a function
    this.notificationUpdatesCallbackWrapper = function(notification) {
        // conditions for external notifications
        if(notification.level === 'push.notification'){
            var vDev = self.controller.devices.get(notification.type);
            if (vDev !== null) {
                vDev.performCommand('alarm', {message: notification.message});
            }
        } else {
            var appData = self.getAllApp();

            // push notification to configured devices
            appData.forEach(function (it) {
                if (it.active === "1") {
                    console.log("(Habitat App Support) Notify listener (NotificationUpdate)");

                    var message;
                    if (it.os === self.ANDROID) {
                        message = {
                            to: it.token,
                            time_to_live: 172800,
                            data: {
                                type: "notification:add",
                                data: notification,
                                hubId: it.hubId
                            }
                        }
                    }

                    self.notifyListener(notification, it.token, "notification:add");
                }
            });
        }
    };
    self.controller.on('notifications.push', self.notificationUpdatesCallbackWrapper);

    self.vDev = vDev;

    // event forwarding
    this.handler = this.onNotificationHandler();

    if (typeof config.logLevelContainer.logLevel !== 'undefined') {
        this.logLevel = config.logLevelContainer.logLevel.split(',');
    } else {
        this.logLevel = [];
    }

    this.devices = [];
    this.collectMessages = [];

    if (config.devices) {
        config.devices.forEach(function(device){
            var deviceId, level, message, comparator;
            if (typeof device.dev_toggleButton !== 'undefined'){
                deviceId = device.dev_toggleButton.dev_select;
                level = device.dev_toggleButton.dev_logLevel;
                message = device.dev_toggleButton.dev_message;
                if (typeof device.dev_toggleButton.dev_matchValue !== 'undefined' && device.dev_toggleButton.dev_matchValue !== 'all')
                    comparator = "=='"+device.dev_toggleButton.dev_matchValue + "'";
                else
                    comparator = null;
            } else if (typeof device.dev_switchControl !== 'undefined'){
                deviceId = device.dev_switchControl.dev_select;
                level = device.dev_switchControl.dev_logLevel;
                message = device.dev_switchControl.dev_message;
                if (typeof device.dev_switchControl.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_switchControl.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_switchControl.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_switchControl.dev_matchValue.dev_matchValueOperation + device.dev_switchControl.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_switchBinary !== 'undefined'){
                deviceId = device.dev_switchBinary.dev_select;
                level = device.dev_switchBinary.dev_logLevel;
                message = device.dev_switchBinary.dev_message;
                if (typeof device.dev_switchBinary.dev_matchValue !== 'undefined' && device.dev_switchBinary.dev_matchValue !== 'all')
                    comparator = "=='"+device.dev_switchBinary.dev_matchValue + "'";
                else
                    comparator = null;
            } else if (typeof device.dev_switchMultilevel !== 'undefined'){
                deviceId = device.dev_switchMultilevel.dev_select;
                level = device.dev_switchMultilevel.dev_logLevel;
                message = device.dev_switchMultilevel.dev_message;
                if (typeof device.dev_switchMultilevel.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_switchMultilevel.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_switchMultilevel.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_switchMultilevel.dev_matchValue.dev_matchValueOperation + device.dev_switchMultilevel.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_sensorBinary !== 'undefined'){
                deviceId = device.dev_sensorBinary.dev_select;
                level = device.dev_sensorBinary.dev_logLevel;
                message = device.dev_sensorBinary.dev_message;
                if (typeof device.dev_sensorBinary.dev_matchValue !== 'undefined' && device.dev_sensorBinary.dev_matchValue !== 'all')
                    comparator = "=='"+device.dev_sensorBinary.dev_matchValue + "'";
                else
                    comparator = null;
            } else if (typeof device.dev_sensorMultilevel !== 'undefined'){
                deviceId = device.dev_sensorMultilevel.dev_select;
                level = device.dev_sensorMultilevel.dev_logLevel;
                message = device.dev_sensorMultilevel.dev_message;
                if (typeof device.dev_sensorMultilevel.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_sensorMultilevel.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_sensorMultilevel.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_sensorMultilevel.dev_matchValue.dev_matchValueOperation + device.dev_sensorMultilevel.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_sensorMultiline !== 'undefined'){
                deviceId = device.dev_sensorMultiline.dev_select;
                level = device.dev_sensorMultiline.dev_logLevel;
                message = device.dev_sensorMultiline.dev_message;
                if (typeof device.dev_sensorMultiline.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_sensorMultiline.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_sensorMultiline.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_sensorMultiline.dev_matchValue.dev_matchValueOperation + device.dev_sensorMultiline.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_fan !== 'undefined'){
                deviceId = device.dev_fan.dev_select;
                level = device.dev_fan.dev_logLevel;
                message = device.dev_fan.dev_message;
                if (typeof device.dev_fan.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_fan.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_fan.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_fan.dev_matchValue.dev_matchValueOperation + device.dev_fan.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_doorLock !== 'undefined'){
                deviceId = device.dev_doorLock.dev_select;
                level = device.dev_doorLock.dev_logLevel;
                message = device.dev_doorLock.dev_message;
                if (typeof device.dev_doorLock.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_doorLock.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_doorLock.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_doorLock.dev_matchValue.dev_matchValueOperation + device.dev_doorLock.dev_matchValue.dev_matchValueOperand;
                } else
                    comparator = null;
            } else if (typeof device.dev_thermostat !== 'undefined'){
                deviceId = device.dev_thermostat.dev_select;
                level = device.dev_thermostat.dev_logLevel;
                message = device.dev_thermostat.dev_message;
                if (typeof device.dev_thermostat.dev_matchValue !== 'undefined') {
                    if ((typeof device.dev_thermostat.dev_matchValue.dev_matchValueOperation !== 'undefined')&&
                        (typeof device.dev_thermostat.dev_matchValue.dev_matchValueOperand !== 'undefined'))
                        comparator = device.dev_thermostat.dev_matchValue.dev_matchValueOperation + device.dev_thermostat.dev_matchValueOperand;
                } else
                    comparator = null;
            } else {
                return;
            }

            self.devices.push({
                "id": deviceId,
                "level": level,
                "message": message,
                "comparator": comparator
            });
        });

        this.controller.on('notifications.push', this.handler);
    }
};

HabitatAppSupport.prototype.createHabitatAppSupportPhone = function(deviceToken, hubId, title, os) {
    var self = this;

    var HabitatAppSupportPhoneExist = false;

    // check existence of virtual device by device id and device token (metrics)
    var counter = 0; // counter for unique titles

    self.controller.devices.forEach(function(vDev) {
        var metrics = vDev.get("metrics");
        if (metrics && metrics.deviceToken) {
            if (vDev.id.indexOf("HabitatAppSupportPhone") !==-1 && metrics.deviceToken !== deviceToken) { // same title and different device tokens -> other installation
                counter++;
            } else if (metrics.deviceToken === deviceToken) { // different device tokens
                HabitatAppSupportPhoneExist = true;
            }
        }
    });

    if (HabitatAppSupportPhoneExist) {
        return;
    }

    // create virtual device
    var vDev = self.controller.devices.create({
        deviceId: 'Phone-' + title + "-" + counter,
        defaults: {
            metrics: {
                title: 'Phone: ' + title + " " + counter,
                deviceToken: deviceToken,
                hubId: hubId,
                os: os
            }
        },
        overlay: {
            deviceType: 'toggleButton',
            probeType: 'notification_push',
            visibility: true,
            metrics: {
                title: 'Phone: ' + title + " " + counter,
				icon: "/ZAutomation/api/v1/load/modulemedia/HabitatAppSupport/icon.png",
                deviceToken: deviceToken,
                hubId: hubId,
                os: os
			}
        },
        handler: function (command, args) {
            if (command === "alarm") {
                var alarmMessage = args.message;
                var deviceToken = this.get("metrics").deviceToken;
                var hubId = this.get("metrics").hubId;
                var os = this.get("metrics").os;

                if (alarmMessage && deviceToken && hubId && os) {
                    var message;

                    if (os === self.ANDROID) {
                        message = {
                            to: deviceToken,
                            time_to_live: 172800,
                            data: {
                                type: "alarm:message",
                                data: alarmMessage,
                                hubId: hubId
                            }
                        }
                    }

                    if (message) {
                        self.notifyListener(alarmMessage, deviceToken, "alarm:message");
                    }
                } else {
                    console.log("(Habitat App Support) Phone: Error occurrd during alarm command handling!");
                }
			} else if (command === "on") {
                var deviceToken = this.get("metrics").deviceToken;
                var hubId = this.get("metrics").hubId;
                var os = this.get("metrics").os;

                if (deviceToken && hubId && os) {
                    var message;

                    if (os === self.ANDROID) {
                        message = {
                            to: deviceToken,
                            time_to_live: 172800,
                            data: {
                                type: "alarm:message",
                                data: "This is a push test on the phone: " + title,
                                hubId: hubId
                            }
                        }
                    }

                    if (message) {
                        console.log("Habitat App Support) Phone: Sending push test to: " + title);
                        self.notifyListener(data, deviceToken, "alarm:message");
                    }
                } else {
                    console.log("(Habitat App Support) Phone: Error occurrd during alarm command handling!");
                }
            }
        },
        moduleId: self.id
    });

    // create presence device for mobile phone
    self.createPresenceMobilePhone(title, counter);

    /* Add device ID to HabitatAppSupport instance */
    var known_phone = false;
    self.config.phones.table.forEach(function(phones) {
        known_phone |= phones.phones_dev === vDev.deviceId;
    });
    if(!known_phone) {
        console.log('Add device to instance: ', vDev.deviceId);
        self.config.phones.table.push({"phones_dev": vDev.deviceId, "phones_title": title})
    }
};


HabitatAppSupport.prototype.createPresenceMobilePhone = function(title, counter) {
    var self = this;

    // create virtual device
    var vDev = self.controller.devices.create({
        deviceId: 'Phone-' + title + "-" + counter +'-presence',
        defaults: {
            deviceType: 'sensorDiscrete',
            metrics: {
                title: 'Phone: ' + title + " " + counter + " presence",
                icon: "/ZAutomation/api/v1/load/modulemedia/HabitatAppSupport/phone_local.png",
                type: "C",
                currentScene: "LOCAL",
                level: "LOCAL"
            }
        },
        overlay: {},
        handler: function (command, args) {},
        moduleId: self.id
    });

    if(vDev) {
        self.controller.devices.on(vDev.id, "change:metrics:currentScene", function(vDev) {
            console.log("cahnge currentScene");
            var state = vDev.get("metrics:currentScene");
            if(state === "LOCAL") {
                vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/HabitatAppSupport/phone_local.png");
            } else if(state === "REMOTE") {
                vDev.set("metrics:icon", "/ZAutomation/api/v1/load/modulemedia/HabitatAppSupport/phone_remote.png");
            }
        });
    }
};

HabitatAppSupport.prototype.notifyListener = function(message, token, type) {
    var self = this;

    var messageData = {
      message_text : message,
      device_token : token,
      message_type : type
    }

    if (token) {
        var req = {
            url: "https://us-central1-habitat-app-33c0b.cloudfunctions.net/deviceNotification",
            method: "POST",
            headers: {
                 'Content-Type': 'application/json'
            },
            data: JSON.stringify(messageData),
            async: true,
            success: function(response) {
                console.log("(Habitat App Support) Notify listener success");
            },
            error: function(response) {
                console.log("(Habitat App Support) Notify listener failed: " + response.statusText);
            }
        };

        try {
            http.request(req);
        } catch (e) {
            console.log("(Habitat App Support) Exception during notify listener.");
        }
    }
};

HabitatAppSupport.prototype.removeCallbacks = function () {
    var self = this;

    // remove device updates callback
    if(typeof self.deviceUpdatesCallbackWrapper === "function") {
        self.controller.devices.off("change:metrics:level", self.deviceUpdatesCallbackWrapper);
        self.deviceUpdatesCallbackWrapper = {};
    }

    // remove notification callback
    if(typeof self.notificationUpdatesCallbackWrapper === "function") {
        self.controller.off("notifications.push", self.notificationUpdatesCallbackWrapper);
        self.notificationUpdatesCallbackWrapper = {};
    }
};

HabitatAppSupport.prototype.stop = function () {
    var self = this;

    // remove websocket callbacks
    self.removeCallbacks();

    if (self.vDev) {
        self.controller.devices.remove(self.vDev.id);
    }

    // event forwarding
    if (this.timer) {
        clearInterval(this.timer);
    }

    this.controller.off('notifications.push', this.handler);

    HabitatAppSupport.super_.prototype.stop.call(self);
};

/**
 * Add app to db-file
 * @param {Object} app - app instance
 * @return {Number} status - 0 item allready exist - 1 new item inserted
 */
HabitatAppSupport.prototype.registerApp = function (app) {
    var self = this;

    // load db-file
    var tableApp= loadObject(self.DB_TABLE_APP);

    // create db-file, if neccessary
    if (!tableApp) {
        tableApp = {
            db: self.DB_NAME,
            created: Date.now(),
            data: []
        };
    }

    // if an entry of app exist returns null
    var found = _.findWhere(tableApp.data, {token: app.token}); // _.findWhere returns single object or undefined
    if(found) {
        return 0;
    } else {
        // add new item and store db-file
        tableApp.data.push(app);
        saveObject(self.DB_TABLE_APP, tableApp);

        return 1;
    }
};

/**
 * Update app to db-file
 * @param {String} token
 * @return {Object} app or null
 */
HabitatAppSupport.prototype.getApp = function (token) {
    var self = this;

    // load db-file
    var tableApp = loadObject(self.DB_TABLE_APP);

    // create db-file, if neccessary
    if (!tableApp) {
        return null;
    }

    // if an entry of app exist returns null
    var app = _.findWhere(tableApp.data, {token: token}); // _.findWhere returns single object or undefined
    if(!app) {
        return null;
    } else {
        return app;
    }
};

/**
 * Update app to db-file
 * @param {Object} app app instance
 * @return {Number} status -1 db not found / 0 item not found / 1 item updated
 */
HabitatAppSupport.prototype.updateApp = function (app) {
    var self = this;

    // load db-file
    var tableApp = loadObject(self.DB_TABLE_APP);

    // create db-file, if neccessary
    if (!tableApp) {
        return -1;
    }

    // if an entry of app exist returns null
    var oldApp = _.findWhere(tableApp.data, {token: app.token}); // _.findWhere returns single object or undefined
    if(!oldApp) {
        return 0;
    } else {
        // remove old item from array
        tableApp.data = _.without(tableApp.data, _.findWhere(tableApp.data, oldApp));

        // update modified date
        app.modified = new Date();

        // add new item and store db-file
        tableApp.data.push(app);
        saveObject(self.DB_TABLE_APP, tableApp);

        return 1;
    }
};

/**
 * Removes app from db-file
 * @param {String} token - token addresses the app
 * @return {Object} removed object or null if an error occours
 */
HabitatAppSupport.prototype.removeApp = function (token) {
    var self = this;

    // load db-file
    var tableApp = loadObject(self.DB_TABLE_APP);

    // create db-file, if neccessary
    if (tableApp) {
        var app = _.findWhere(tableApp.data, {token: token});
        if(app) {
            // remove from array
            tableApp.data = _.without(tableApp.data, _.findWhere(tableApp.data, app));
            // save new array
            saveObject(self.DB_TABLE_APP, tableApp);

            return app;
        } else {
            return null; // no item found
        }
    } else {
        return null; // no db-file
    }
};

/**
 * Returns an array of app from db-file
 * @return {Array} pure data, without db-structure
 */
HabitatAppSupport.prototype.getAllApp = function () {
    var self = this;

    // load db-file
    var tableApp = loadObject(self.DB_TABLE_APP);

    if (tableApp) {
        return tableApp.data;
    } else {
        return [];
    }
};

/**
 * The method provides a factory for app
 * @param {String} token - token addresses the app
 * @param {Number} hubId - hub id is the unique identifier in app for this hub
 * @param {String} title - title for presence app
 * @param {String} os - android is the only currenctly supported OS.
 * @param {Number} active - indicator for sending notifications
 * @return {Object} app
 */
HabitatAppSupport.prototype.generateApp = function (token, hubId, title, os) {
    var self = this;

    return {
        'token':            token,
        'hubId':            hubId,
        'title':            title,
        'os':               os,
        'active':           "0",
        'lastNotification': new Date(),
        'lastStatus':       'Unknown',
        'created':          new Date(),
        'modified':         new Date()
    }
};

/**
 * toString-Method for app
 * @param {Object} app - app instance
 * @return {String} string representation for app
 */
HabitatAppSupport.prototype.toStringApp = function (app) {
    var self = this;

    return "HabitatAppSupport App"
        + ":" + app.token
        + ":" + app.hubId
        + ":" + app.title
        + ":" + app.active
        + ":" + app.os
        + ":" + app.lastNotification
        + ":" + app.lastStatus
        + ":" + app.created
        + ":" + app.modified;
};

/*
 * event forwarding
 */

HabitatAppSupport.prototype.onNotificationHandler = function () {
    var self = this;

    return function(notice) {
        var sendMessage = false, deviceMessage = "", value;
        if (self.logLevel.length > 0) {
            self.logLevel.forEach(function (level) {
                if (((level === "errors")&&((notice.level === "critical")||(notice.level === "error")))||
                    ((level === "notifications")&&((notice.level === "notification")||(notice.level === "device-info")))||
                    ((level === "warnings")&&(notice.level === "warning"))) {
                    sendMessage = true;
                }
            });
        }
        if ((!sendMessage)&&(self.devices.length > 0)) {
            self.devices.forEach(function (device) {
                // additional condition: if device registered multiple with different comparators
                // only one matches ...
                if (notice.source === device.id && sendMessage === false) {
                    if (((device.level === "errors")&&((notice.level === "critical")||(notice.level === "error")))||
                       ((device.level === "notifications")&&((notice.level === "notification")||(notice.level === "device-info")))||
                       ((device.level === "warnings")&&(notice.level === "warning"))) {
                        sendMessage = true;
                        deviceMessage = device.message;
                        if (device.comparator !== null) {
                            value = parseFloat(notice.message.l);
                            if (isNaN(value)) {
                                if (eval("'" + notice.message.l + "'" + device.comparator) === false) {
                                    sendMessage = false;
                                }
                            } else {
                                if (eval(value+device.comparator) === false) {
                                    sendMessage = false;
                                }
                            }
                        }
                    }
                }
            });
        }

        if (sendMessage) {
            // add to message collection
            if (typeof deviceMessage !== 'undefined' && deviceMessage !== "") {
                // self.collectMessages.push(deviceMessage);
                self.sendPushMessage(deviceMessage);
            } else {
                // self.collectMessages.push(notice.message.dev + " : " + notice.message.l);
                self.sendPushMessage(notice.message.dev + " : " + notice.message.l);
            }

            // add delay timer if not existing
            // if(!self.timer){
            //    self.sendPushMessageWithDelay();
            //}
        }
    };
};

HabitatAppSupport.prototype.sendPushMessage = function (notification) {
    var self = this;

    var appData = self.getAllApp();

    console.log("(Habitat App Support) Notify listener (EventForwarding): " + JSON.stringify(notification));

    appData.forEach(function(it) {
        var message;

        if (it.os === self.ANDROID) {
            message = {
                to: it.token,
                time_to_live: 172800,
                data: {
                    type: "alarm:event",
                    data: notification,
                    hubId: it.hubId
                }
            }
        }

        if (message) {
            self.notifyListener(notification, it.token, "alarm:event");
        }
    });
};

HabitatAppSupport.prototype.sendPushMessageWithDelay = function () {
    var self = this;

    this.timer = setInterval( function() {

        if (self.collectMessages.length > 0) {
            var appData = self.getAllApp();

            var collectMessage =  self.collectMessages.shift();
            console.log("(Habitat App Support) Notify listener (EventForwarding): " + JSON.stringify(collectMessage));

            appData.forEach(function(it) {
                var message;

                if (it.os === self.ANDROID) {
                    message = {
                        to: it.token,
                        time_to_live: 172800,
                        data: {
                            type: "alarm:event",
                            data: collectMessage,
                            hubId: it.hubId
                        }
                    }
                }

                if (message) {
                    self.notifyListener(collectMessage, it.token, "alarm:event");
                }
            });

        } else {
            if (self.timer) {
                clearInterval(self.timer);
                self.timer = undefined;
            }
        }
    }, 500);
};
