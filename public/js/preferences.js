$(document).ready(function () {
	// Save button
	$('.save-button').click(function() {
		var err = false;

		var phone = stripLow($('#input-phone').val());
		if (!isPhoneNumber(phone)) {
			$('.phone').addClass('error');
			$('.phone label[for=\'input-phone\']').text('Phone Number (invalid phone number)');
			err = true;
		}
		var email = $('#input-email').val().toLowerCase();
		if (!filter.test(email)) {
			$('.email').addClass('error');
			$('.email label[for=\'input-email\']').text('Email Address (invalid email)');			
			err = true;
		}
		if (err) return false; 

		var phoneenable = $('#input-phoneenable').is(':checked') ? 1 : 0;
		var emailenable = $('#input-emailenable').is(':checked') ? 1 : 0;
		
		// new preferences for user
		var userprefs = {
			phone : 			phone,
			phoneenable : 		phoneenable,
			email : 			email,
			emailenable : 		emailenable,
		};
		
		$('.save-button').prop('disabled', true).html("Saving");
		$('.fail-message').css('visibility', 'hidden');
		socket.emit('save preferences', userprefs, function(success) {
			if (success) {
				// leave preferences
				window.location.href = '/dashboard';
			} else {
				// server error
				$('.save-button').prop('disabled', false).html("Save");
				$('.fail-message').css('visibility', 'visible');
			}
		});
		return false;
	});
	
	// Cancel button
	$('.cancel-button').click(function() {
		// leave preferences
		window.location.href = '/dashboard';
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