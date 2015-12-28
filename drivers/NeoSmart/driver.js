'use strict';

/**
 * Dependencies
 */
var heatmiser = require('heatmiser');
var _ = require('underscore');

/**
 * Arrays used to store devices
 * @type {Array}
 */
var devices = [];
var temp_devices = [];
var installed_devices = [];

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
module.exports.init = function (devices_data, callback) {
	installed_devices = devices_data;

	neo = new heatmiser.Neo();

	// Found devices
	neo.on('ready', function (host, port, found_devices) {

		// Check for each device if it is already installed, or should be
		found_devices.forEach(function (device) {
			var device_id = generateDeviceID(device.device, device.DEVICE_TYPE);

			// Check if device is not already installed
			if (!getDevice(device_id, devices) && !getDevice(device_id, temp_devices)) {

				// Check if device was installed before
				var list = (_.findWhere(installed_devices, {id: device_id})) ? devices : temp_devices;

				// Add device to array of found devices (for multiple devices support)
				list.push({
					name: device.device,
					data: {
						id: device_id,
						target_temperature: device.CURRENT_SET_TEMPERATURE,
						measured_temperature: device.CURRENT_TEMPERATURE
					}
				});
			}
		});
	});

	callback(null, true);
};

/**
 * Default pairing process
 */
module.exports.pair = function (socket) {

	socket.on("list_devices", function (data, callback) {
		neo = new heatmiser.Neo();

		// Found devices
		neo.on('ready', function (host, port, found_devices) {

			// Check for each device if it is already installed, or should be
			found_devices.forEach(function (device) {
				var device_id = generateDeviceID(device.device, device.DEVICE_TYPE);

				// Check if device is not already installed
				if (!getDevice(device_id, devices) && !getDevice(device_id, temp_devices)) {

					// Check if device was installed before
					var list = (_.findWhere(installed_devices, {id: device_id})) ? devices : temp_devices;

					// Add device to array of found devices (for multiple devices support)
					list.push({
						name: device.device,
						data: {
							id: device_id,
							target_temperature: device.CURRENT_SET_TEMPERATURE,
							measured_temperature: device.CURRENT_TEMPERATURE
						}
					});
				}
			});

			var devices_list = [];
			temp_devices.forEach(function (temp_device) {
				devices_list.push({
					data: {
						id: temp_device.data.id
					},
					name: temp_device.name
				});
			});

			callback(null, devices_list);
		});
	});

	socket.on("add_device", function (device, callback) {

		// Store device as installed
		devices.push(getDevice(device.data.id, temp_devices));

		if (callback) callback (null, true);
	});
};

/**
 * These represent the capabilities of the Heatmiser Neo Smart
 */
module.exports.capabilities = {

	target_temperature: {
		get: function (device, callback) {
			if (device instanceof Error) return callback(device);

			// Retrieve updated data
			updateDeviceData(function () {

				// Get device data
				var thermostat = getDevice(device.id, devices);
				if (!thermostat) return callback(device);

				callback(null, thermostat.data.target_temperature);
			});
		},
		set: function (device, temperature, callback) {
			if (device instanceof Error) return callback(device);

			// Get device data
			var thermostat = getDevice(device.id, devices);
			if (!thermostat) return callback(device);

			// Catch faulty trigger and max/min temp
			if (!temperature) {
				callback(true, temperature);
				return false;
			}
			else if (temperature < 5) {
				temperature = 5;
			}
			else if (temperature > 35) {
				temperature = 35;
			}
			neo.setTemperature(Math.round(temperature * 10) / 10, thermostat.name, function (err, success) {
				// Return error/success to front-end
				if (callback) callback(err, temperature);
			});
		}
	},

	measure_temperature: {
		get: function (device, callback) {
			if (device instanceof Error) return callback(device);

			// Retrieve updated data
			updateDeviceData(function () {

				// Get device data
				var thermostat = getDevice(device.id, devices);
				if (!thermostat) return callback(device);

				// Callback measured temperature
				callback(null, parseInt(thermostat.data.measured_temperature));
			});
		}
	}
};

/**
 * Delete devices internally when users removes one
 * @param device_data
 */
module.exports.deleted = function (device_data) {

	// Remove ID from installed devices array
	for (var x = 0; x < devices.length; x++) {
		if (devices[x].data.id === device_data.id) {
			devices = _.reject(devices, function (device) {
				return device.data.id === device_data.id;
			});
		}
	}
	for (var x = 0; x < temp_devices.length; x++) {
		if (temp_devices[x].data.id === device_data.id) {
			temp_devices = _.reject(temp_devices, function (device) {
				return device.data.id === device_data.id;
			});
		}
	}
};

/**
 * Util function that gets the correct iKettle from the kettles
 * array by its device_id
 * @param device_id
 * @returns {*}
 */
function getDevice(device_id, list) {
	var devices = list ? list : devices;

	if (devices.length > 0) {
		for (var x = 0; x < devices.length; x++) {
			if (devices[x].data.id === device_id) {
				return devices[x];
			}
		}
	}
};

/**
 * Request new information from neo and update
 * it internally
 * @param callback
 */
function updateDeviceData(callback) {

	if (neo) {
		// Request updated information
		neo.info(function (data) {

			// Store new available data for each device
			data.devices.forEach(function (device) {
				var internal_device = getDevice(generateDeviceID(device.device, device.DEVICE_TYPE), devices);
				internal_device.data = {
					id: generateDeviceID(device.device, device.DEVICE_TYPE),
					target_temperature: device.CURRENT_SET_TEMPERATURE,
					measured_temperature: device.CURRENT_TEMPERATURE
				}
			});
			if (callback) callback();
		});
	}
}

/**
 * Generates a unique ID based on two input parameters
 * @param param1
 * @param param2
 * @returns {string} unique device ID
 */
function generateDeviceID(param1, param2) {
	return new Buffer(param1 + param2).toString('base64');
}