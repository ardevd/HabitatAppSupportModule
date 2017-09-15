function modulePostRender(control) {
    $(document).off('click', 'button[data-alpaca-array-actionbar-action="delete"]').on('click', 'button[data-alpaca-array-actionbar-action="delete"]', function(e) {
        e.preventDefault();
        var table_id = $(this).parent()[0].getAttribute("data-alpaca-array-actionbar-item-index");

        alertify.confirm(control.data.delete_phone, function () {
            $.ajax("/ZAutomation/api/v1/instances/HabitatAppSupport")
                .done(function (mobapp) {
                    var phone = mobapp.data[0].params.phones.table[table_id];

                    console.log('Phone to delete: ', phone);

                    /* Remove device */
                    $.ajax("/ZAutomation/api/v1/devices/HabitatAppSupport/command/clearOne?title="+phone.phones_title+"&id="+phone.phones_dev)
                        .done(function () {
                            /* Reload location */
                            location.reload();
                        });

                })
                .fail(function () {
                });

            });
    });

    /* Hide Add-Button, if no device is selectable */
    var button = $(document).find('.btn-default')[0];
    if($(button).parent().parent().parent()[0].classList.contains("phoneTable")) {
        $(button).hide();
    }
}
