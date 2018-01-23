CELLS = 36;
percents = new Array(CELLS);
voltages = new Array(CELLS);
currents = new Array(CELLS);
temps = new Array(CELLS);

function updateCell(i, percent, voltage, current, temp){
	percents[i] = percent;
	voltages[i] = voltage;
	currents[i] = current;
	temps[i] = temp;
}

function updateTemp(i, temp){
	temps[i] = temp;
	$('#cell-'+i+' .temp').html(temp.toFixed(2)+'&deg;C');
}

function updateVoltage(i, voltage){
	$('#cell-'+i+' .voltage').html(voltage.toFixed(3)+'V');
	voltages[i] = voltage;
	updateSoC(i, (voltage-2.8)/(4.2-2.8)*100);
}

function updateErrors(i, errors){
	$('#cell-'+i+' .errors').html(errors);
}

function updateSoC(i, percent){
	//$('#cell-'+i+' .soc').html(mAh.toFixed(0)+'mAh');
	cell = $('#cell-'+i+' .battery-charge-filled');
	cell.css('width', percent+'%');
	if(percent < 30){
		color = '#800';
	}else if(percent < 60){
		color = '#bb0';
	}else{
		color = '#080';
	}
	cell.css('background-color', color);
}

function updateCurrent(i, current){
	$('#cell-'+i+' .current').html(Math.round(current)+'mA');
}

function setupCells(){
	for(i=0;i<CELLS;i++){
		node = $('#template').clone();
		node.find('.cell-number').html("#"+(i+1)+": ");
		node.attr('id', 'cell-' + i);
		node.attr('class', 'battery-cell');
		$('#cells').append(node);
	}

	node = $('#template').hide();
}

$(document).ready(function(){
	//Create cells from template
	setupCells();

});

function average(arr){
	return sum(arr)/arr.length;
}

function min(arr){
	var m = Infinity;
	for(i=0; i<arr.length; i++){
		if(arr[i] < m) m = arr[i];
	}
	return m;
}

function max(arr){
	var m = -Infinity;
	for(i=0; i<arr.length; i++){
		if(arr[i] > m) m = arr[i];
	}
	return m;
}

function sum(arr){
	total = 0;
	for(i=0; i<arr.length; i++){
		total += arr[i];
	}
	return total;
}
