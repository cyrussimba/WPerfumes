if (!audio) {
    // Nothing to do if there's no audio element on the page
    return;
}

// If missing, create the button and icon
if (!muteBtn) {
    const player = document.getElementById('hero-audio-player') || audio.parentNode || document.body;
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

    // Insert near the audio element when possible, otherwise append to player
    try {
        if (player && player.insertBefore && audio && audio.parentNode === player) {
            player.insertBefore(btn, audio);
        } else if (audio && audio.parentNode) {
            audio.parentNode.insertBefore(btn, audio);
        } else {
            (player || document.body).appendChild(btn);
        }
    } catch (e) {
        // Last-resort append
        (document.body).appendChild(btn);
    }

    // Now update references so the rest of the code uses the created nodes
    muteBtn = document.getElementById('heroAudioMuteBtn');
    muteIcon = document.getElementById('heroAudioMuteIcon');
}

// Ensure status element reference (may be absent)
if (!status) status = document.getElementById('heroAudioStatus');

// Helper functions
function updateUI() {
    if (!audio || !muteBtn || !muteIcon) return;
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

// Play audio (autoplay on load) - handle browsers that block autoplay
function playAudioDefault() {
    if (!audio) return;
    // prefer to start muted first if autoplay policy prevents unmuted playback
    audio.muted = false;
    audio.play().then(() => {
        updateUI();
    }).catch(() => {
        // If autoplay fails, mute and try playing again (common fallback)
        audio.muted = true;
        audio.play().then(updateUI).catch(() => {
            // If still fails, leave muted/paused and update UI
            updateUI();
        });
    });
}

// Button click handler (guard existence)
if (muteBtn) {
    muteBtn.addEventListener('click', function () {
        try {
            audio.muted = !audio.muted;
            // re-trigger play to ensure state is consistent on some browsers
            if (!audio.paused) {
                audio.play().catch(() => { /* ignore */ });
            }
            updateUI();
        } catch (e) {
            // defensive: do not throw from UI handlers
            console.warn('hero-audio: mute toggle failed', e);
        }
    });

    // Keyboard accessibility
    muteBtn.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            muteBtn.click();
        }
    });
}

// Initial state: attempt to play and update UI
playAudioDefault();
updateUI();