document.addEventListener('DOMContentLoaded', function () {
    const audio = document.getElementById('heroAudio');
    const muteBtn = document.getElementById('heroAudioMuteBtn');
    const muteIcon = document.getElementById('heroAudioMuteIcon');
    const status = document.getElementById('heroAudioStatus');

    // If missing, create the button and icon
    if (!muteBtn) {
        const player = document.getElementById('hero-audio-player');
        const btn = document.createElement('button');
        btn.id = 'heroAudioMuteBtn';
        btn.className = 'hero-audio-btn';
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', 'Mute/unmute hero audio');
        btn.title = 'Mute/unmute audio';
        const icon = document.createElement('span');
        icon.id = 'heroAudioMuteIcon';
        icon.textContent = '🔈';
        btn.appendChild(icon);
        player.insertBefore(btn, audio);
    }

    // Helper functions
    function updateUI() {
        if (audio.muted) {
            muteIcon.textContent = '🔈';
            muteBtn.setAttribute('aria-pressed', 'false');
            muteBtn.setAttribute('aria-label', 'Unmute hero audio');
            muteBtn.title = 'Unmute audio';
            if (status) {
                status.textContent = 'Muted';
                status.style.display = 'inline';
            }
        } else {
            muteIcon.textContent = '🔊';
            muteBtn.setAttribute('aria-pressed', 'true');
            muteBtn.setAttribute('aria-label', 'Mute hero audio');
            muteBtn.title = 'Mute audio';
            if (status) {
                status.textContent = 'Playing';
                status.style.display = 'inline';
            }
        }
    }

    // Play audio (autoplay on load)
    function playAudioDefault() {
        audio.muted = false;
        audio.play().then(() => {
            updateUI();
        }).catch(() => {
            // If autoplay fails, mute and try playing
            audio.muted = true;
            audio.play().then(updateUI);
        });
    }

    // Button click handler
    muteBtn.addEventListener('click', function () {
        audio.muted = !audio.muted;
        if (!audio.paused) {
            audio.play();
        }
        updateUI();
    });

    // Keyboard accessibility
    muteBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            muteBtn.click();
        }
    });

    // Initial state
    playAudioDefault();
    updateUI();
});