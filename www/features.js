
function arrayIntegrator(){
	if(arrayAmps > -100){
		lapArrayAccumulator = lapArrayAccumulator + arrayAmps;
	}
}
setInterval(arrayIntegrator, 1000);

function speedIntegrator(){
	if(speed > -100){
		lapSpeedAccumulator = lapSpeedAccumulator + speed;
		lapSpeedCounts = lapSpeedCounts + 1;
	}
}
setInterval(speedIntegrator, 100);

var tripOdometer = 0;

function odometerIntegrator(){
	if(speed > -100){
		tripOdometer = (tripOdometer + speed/3600)/1;
	}
	setContent('data-odometer', tripOdometer.toFixed(2));
}
setInterval(odometerIntegrator, 1000);

$('#control-odometer-form').submit(function(e){
	e.preventDefault();
	tripOdometer = parseFloat($('#control-odometer-value').val());
	$('#control-odometer-value').val('');
});

function lapTimeUpdator(){
	setContent('data-lap-curtime', ((new Date() - lapTimeStart)/1000).toFixed(1));
}
setInterval(lapTimeUpdator, 100);


$('#btn-nextlap').click(function(){
	var batterymAh = batteryAh * 1000;
	var t = (new Date() - lapTimeStart)/1000;
	setContent('data-lap-time', t);
	var battEnergy = (batterymAh - lapmAhStart);
	setContent('data-lap-batt', battEnergy.toFixed(3));
	var arrayEnergy = lapArrayAccumulator/3600*1000;
	setContent('data-lap-array', arrayEnergy.toFixed(3));
	setContent('data-lap-motor', (battEnergy - arrayEnergy).toFixed(3));
	var avgSpeed = lapSpeedAccumulator/lapSpeedCounts;
	setContent('data-lap-speed', (avgSpeed).toFixed(1));
	
	setContent('data-lap-avg-motor-current', (3.600*(battEnergy - arrayEnergy) / t).toFixed(2))

    var arrayPower = arrayEnergy * 3.6 * batteryVoltage / t;
    var battPower = battEnergy * 3.6 * batteryVoltage / t
    var motorPower = arrayPower - battPower;
    setContent('data-lap-avg-motor-power', motorPower.toFixed(0));
    setContent('data-lap-avg-array-power', arrayPower.toFixed(0));
    setContent('data-lap-avg-batt-power', battPower.toFixed(0));
	
	lapTimeStart = new Date();
	lapmAhStart = batterymAh;
	lapArrayAccumulator = 0;
	lapSpeedAccumulator = 0;
	lapSpeedCounts = 0;
});
