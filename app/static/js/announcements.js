// Place at static/js/announcements.js
// Announcements JS (updated):
// - vertical scrolling with pause on hover/focus
// - doesn't steal focus on load
// - improved handling of item height for dynamic fonts
// - dropdown change shows non-blocking feedback (toast fallback)

document.addEventListener('DOMContentLoaded', function () {
    // Scrolling announcements
    const announcementList = document.querySelector('.announcement-list');
    const items = announcementList ? Array.from(announcementList.querySelectorAll('li')) : [];

    if (announcementList && items.length > 0) {
        let currentIndex = 0;
        // compute height from first item but re-measure on window resize
        let itemHeight = items[0].getBoundingClientRect().height || 22;
        let intervalId = null;
        const delay = 3000; // ms

        function updateItemHeight() {
            itemHeight = (items[0] && items[0].getBoundingClientRect().height) || 22;
        }

        function showNextMessage() {
            currentIndex = (currentIndex + 1) % items.length;
            const translateYValue = -currentIndex * itemHeight;
            announcementList.style.transform = `translateY(${translateYValue}px)`;
        }

        function startAutoScroll() {
            if (intervalId) clearInterval(intervalId);
            intervalId = setInterval(showNextMessage, delay);
        }

        function stopAutoScroll() {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        }

        // Start auto-scroll after a tiny delay so fonts/layout are settled
        setTimeout(function () {
            updateItemHeight();
            startAutoScroll();
        }, 120);

        // Pause on hover/focus for accessibility
        announcementList.addEventListener('mouseenter', stopAutoScroll);
        announcementList.addEventListener('mouseleave', startAutoScroll);

        // Keyboard users: make each item focusable and pause on focus
        items.forEach(function (it) {
            it.setAttribute('tabindex', '0');
            it.addEventListener('focus', stopAutoScroll);
            it.addEventListener('blur', startAutoScroll);
        });

        // Recompute item height on resize/orientation change (responsive)
        window.addEventListener('resize', function () {
            updateItemHeight();
            // ensure transform uses new height
            const translateYValue = -currentIndex * itemHeight;
            announcementList.style.transform = `translateY(${translateYValue}px)`;
        });
    }

    // City selector: non-blocking friendly acknowledgment on change
    const cityDropdown = document.getElementById('city-dropdown');
    if (cityDropdown) {
        cityDropdown.addEventListener('change', function () {
            const selectedCountry = cityDropdown.value || cityDropdown.options[cityDropdown.selectedIndex].text;

            // Try to use a small toast if one exists (non-blocking). Fallback to ephemeral toast + remove or alert.
            if (window.simpleToast && typeof window.simpleToast === 'function') {
                window.simpleToast(`You have chosen to shop from ${selectedCountry}.`);
            } else {
                const toast = document.createElement('div');
                toast.className = 'announcement-toast';
                toast.textContent = `You have chosen to shop from ${selectedCountry}.`;
                toast.style.position = 'fixed';
                toast.style.right = '12px';
                toast.style.bottom = '12px';
                toast.style.background = 'rgba(0,0,0,0.8)';
                toast.style.color = '#fff';
                toast.style.padding = '8px 12px';
                toast.style.borderRadius = '8px';
                toast.style.zIndex = 99999;
                toast.style.fontSize = '0.95rem';
                document.body.appendChild(toast);
                setTimeout(function () {
                    toast.style.transition = 'opacity 0.25s';
                    toast.style.opacity = '0';
                    setTimeout(function () { toast.remove(); }, 300);
                }, 1800);
            }
        });
    }
});