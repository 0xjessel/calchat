function getGeo() {
	if (Modernizr.geolocation) {
		navigator.geolocation.getCurrentPosition(handle_geolocation_query, handle_errors);
	} else {
		yqlgeo.get('visitor', normalize_yql_response);
	}
}

function handle_errors(error) {
	switch(error.code) {
		case error.PERMISSION_DENIED: console.log("user did not share geolocation data");
		break;

		case error.POSITION_UNAVAILABLE: console.log("could not detect current position");
		break;

		case error.TIMEOUT: console.log("retrieving position timedout");
		break;

		default: console.log("unknown error");
		break;
	}
}

function normalize_yql_response(response) {
	if (response.error)	{
		var error = { code : 0 };
		handle_error(error);
		return;
	}

	var position = {
		coords : {
			latitude: response.place.centroid.latitude,
			longitude: response.place.centroid.longitude
		},
		address : {
			city: response.place.locality2.content,
			region: response.place.admin1.content,
			country: response.place.country.content
		}
	};
	handle_geolocation_query(position);
}

function handle_geolocation_query(position) {
	console.log('Location: '+ position.coords.latitude+','+position.coords.longitude);
	socket.emit('get nearest buildings', position.coords.latitude, position.coords.longitude, 3, function(buildings) {
		var buildingRow = $('.suggestions')
		if (buildingRow.length) {
			buildingRow.empty();
			for (var i = 0; i < buildings.length; i++) {
				var building = buildings[i];
				buildingRow.append('<a class="btn" href="/chat/'+building.pretty.toLowerCase()+'">'+building.longname+'</button>');
			};
		}
	});
}
