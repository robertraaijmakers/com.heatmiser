'use strict';

/**
 * Dependencies
 */
var heatmiser = require( 'heatmiser' );
var _ = require( 'underscore' );

/**
 * Arrays used to store devices
 * @type {Array}
 */
var devices = [];
var temp_devices = [];

/**
 * The Heatmiser Neo Smart client
 */
var neo;

/**
 * Driver start up, re-initialize devices
 * that were already installed before driver
 * shutdown
 * @param devices_data
 * @param callback
 */
module.exports.init = function ( devices_data, callback ) {
    neo = new heatmiser.Neo();

    // Found devices
    neo.on( 'ready', function ( host, port, found_devices ) {

        // Check for each device if it is already installed, or should be
        found_devices.forEach( function ( device ) {
            var device_id = device.device;

            // Check if device was installed before
            var list = (_.findWhere( devices_data, { id: device_id } )) ? devices : temp_devices;

            // Add device to array of found devices (for multiple devices support)
            list.push( {
                name: device_id,
                data: {
                    id: device_id + device.DEVICE_TYPE,
                    target_temperature: device.CURRENT_SET_TEMPERATURE,
                    measured_temperature: device.CURRENT_TEMPERATURE
                }
            } );
        } );
    } );

    callback( true );
};

/**
 * Default pairing process
 */
module.exports.pair = {

    list_devices: function ( callback ) {
        var devices = [];
        temp_devices.forEach( function ( temp_device ) {
            devices.push( {
                data: {
                    id: temp_device.data.id
                },
                name: temp_device.name
            } );
        } );

        callback( devices );
    },

    add_device: function ( callback, emit, device ) {

        // Store device as installed
        devices.push( getDevice( device.data.id, temp_devices ) );
    }
};

/**
 * These represent the capabilities of the Heatmiser Neo Smart
 */
module.exports.capabilities = {

    target_temperature: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Retrieve updated data
            updateDeviceData( function () {

                // Get device data
                var thermostat = getDevice( device.id, devices );

                if ( !thermostat ) return callback( device );

                callback( null, thermostat.data.target_temperature );
            } );
        },
        set: function ( device, temperature, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Catch faulty trigger and max/min temp
            if ( !temperature ) {
                callback( true, temperature );
                return false;
            }
            else if ( temperature < 5 ) {
                temperature = 5;
            }
            else if ( temperature > 35 ) {
                temperature = 35;
            }
            neo.setTemperature( Math.round( temperature * 10) / 10, device.id, function ( err, success ) {

                // Return error/success to front-end
                if ( callback ) callback( err, temperature );
            } );
        }
    },

    measure_temperature: {
        get: function ( device, callback ) {
            if ( device instanceof Error ) return callback( device );

            // Retrieve updated data
            updateDeviceData( function () {

                // Get device data
                var thermostat = getDevice( device.id, devices );
                if ( !thermostat ) return callback( device );

                // Callback measured temperature
                callback( null, thermostat.data.measured_temperature );
            } );
        }
    }
};

/**
 * Delete devices internally when users removes one
 * @param device_data
 */
module.exports.deleted = function ( device_data ) {

    // Remove ID from installed devices array
    for ( var x = 0; x < devices.length; x++ ) {
        if ( devices[ x ].data.id === device_data.id ) {
            devices = _.reject( devices, function ( id ) {
                return id === device_data.id;
            } );
        }
    }
};

/**
 * Util function that gets the correct iKettle from the kettles
 * array by its device_id
 * @param device_id
 * @returns {*}
 */
function getDevice ( device_id, list ) {
    var devices = list ? list : devices;

    if ( devices.length > 0 ) {
        for ( var x = 0; x < devices.length; x++ ) {
            if ( devices[ x ].data.id === device_id ) {
                return devices[ x ];
            }
        }
    }
};

/**
 * Request new information from neo and update
 * it internally
 * @param callback
 */
function updateDeviceData ( callback ) {

    // Request updated information
    neo.info();

    // On incoming data
    neo.on( 'success', function ( data ) {

        // Store new available data for each device
        data.devices.forEach( function ( device ) {
            var internal_device = getDevice( device.device, devices );
            internal_device.data = {
                id: device.device,
                target_temperature: device.CURRENT_SET_TEMPERATURE,
                measured_temperature: device.CURRENT_TEMPERATURE
            }
        } );

        // Perform callback
        if ( callback )callback();
    } );
}