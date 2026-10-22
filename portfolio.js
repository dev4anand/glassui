// Smooth Scrolling for Navigation Links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetElement = document.querySelector(targetId);

        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
        }
    });
});

// Intersection Observer for Fade-in Animations
const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
};

const observer = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('show');
            observer.unobserve(entry.target); // Only animate once
            if (window.Glass) requestAnimationFrame(() => window.Glass.renderAll());
        }
    });
}, observerOptions);

// Observe all elements with the 'hidden' class
document.querySelectorAll('.hidden').forEach((el) => {
    observer.observe(el);
});

// Dynamic Greeting in Console
console.log("%cHello! Welcome to Anand Dev's Portfolio.", "color: #a855f7; font-size: 16px; font-weight: bold;");

// Space Theme Animations
function createStars() {
    const container = document.getElementById('space-background');
    if (!container) return;

    const stars = [];
    for (let i = 0; i < 200; i++) {
        const star = document.createElement('div');
        star.className = 'star';

        const data = {
            left: Math.random() * 100,
            top: Math.random() * 100,
            opacity: Math.random(),
            size: Math.random() * 2 + 1
        };
        stars.push(data);

        star.style.left = data.left + '%';
        star.style.top = data.top + '%';
        star.style.opacity = data.opacity;
        star.style.width = data.size + 'px';
        star.style.height = data.size + 'px';
        container.appendChild(star);
    }

    // Build a matching viewport-sized SVG so GlassUI refracts the same
    // sky gradient and star positions shown on the page.
    const syncGlassBackground = () => {
        const image = document.getElementById('glass-background');
        if (!image) return;

        const width = Math.max(1, window.innerWidth);
        const height = Math.max(1, window.innerHeight);
        const starMarkup = stars.map((star) => {
            const x = (star.left / 100) * width;
            const y = ((star.top / 100) * 1.2 - 0.1) * height;
            return '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) +
                '" r="' + (star.size / 2).toFixed(2) +
                '" fill="#fff" opacity="' + star.opacity.toFixed(3) + '"/>';
        }).join('');

        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width +
            '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
            '<defs><radialGradient id="space" cx="50%" cy="100%" r="100%">' +
            '<stop offset="0%" stop-color="#1b2735"/>' +
            '<stop offset="100%" stop-color="#090a0f"/></radialGradient></defs>' +
            '<rect width="100%" height="100%" fill="url(#space)"/>' +
            starMarkup + '</svg>';

        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    };

    syncGlassBackground();
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(syncGlassBackground, 120);
    });
}

function createShootingStar(x, y) {
    const container = document.getElementById('space-background');
    if (!container) return;

    const shootingStar = document.createElement('div');
    shootingStar.className = 'shooting-star';

    // If coordinates provided (click), start there. Else random.
    if (x !== undefined && y !== undefined) {
        shootingStar.style.left = x + 'px';
        shootingStar.style.top = y + 'px';
    } else {
        shootingStar.style.left = Math.random() * 100 + '%';
        shootingStar.style.top = Math.random() * 50 + '%';
    }

    // Random duration
    const duration = Math.random() * 2 + 2; // 2-4s
    shootingStar.style.animationDuration = duration + 's';

    container.appendChild(shootingStar);

    // Remove after animation
    setTimeout(() => {
        shootingStar.remove();
    }, duration * 1000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    createStars();
    // Spawn a shooting star every 3 seconds randomly
    setInterval(() => createShootingStar(), 3000);

    // Spawn shooting star on click
    document.addEventListener('click', (e) => {
        createShootingStar(e.clientX, e.clientY);
    });
});
