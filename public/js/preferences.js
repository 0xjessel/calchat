$(document).ready(function () {
	// Save button
	$('.save-button').click(function() {
		var phone = stripLow($('#input-phone').val());
		if (!phone) {
			phone = user.phone;
		}
		var phoneenable = $('#input-phoneenable').is(':checked') ? 1 : 0;
		
		var email = $('#input-email').val().toLowerCase();
		if (!email) {
			email = user.email;
		}
		var emailenable = $('#input-emailenable').is(':checked') ? 1 : 0;
		
		// new preferences for user
		var userprefs = {
			phone : 			phone,
			phoneenable : 		phoneenable,
			email : 			email,
			emailenable : 		emailenable,
		};
		
		socket.emit('save preferences', userprefs);
	});
	
	// Cancel button
	$('.cancel-button').click(function() {
		window.location.href = '/dashboard';
		return false;
	});
	
	
	$('#input-phoneenable').change(function() {
		$('#input-phone').attr('disabled', !$(this).is(':checked'));
		$('.icon-phoneenable').addClass($(this).is(':checked') ? 'icon-visible' : 'icon-hidden');
		$('.icon-phoneenable').removeClass($(this).is(':checked') ? 'icon-hidden' : 'icon-visible');
	});
	
	$('#input-emailenable').change(function() {
		$('#input-email').attr('disabled', !$(this).is(':checked'));
		$('.icon-emailenable').addClass($(this).is(':checked') ? 'icon-visible' : 'icon-hidden');
		$('.icon-emailenable').removeClass($(this).is(':checked') ? 'icon-hidden' : 'icon-visible');
	});
	
	$('a[rel=tooltip]').tooltip();
});