/* ================================================================
SMARTROAD — MAIN JAVASCRIPT

This file powers all three SmartRoad pages:

1. index.html  → Homepage, statistics and interactive map
2. report.html → Road issue reporting form
3. issues.html → Issue database, filters and statistics

DATA STORAGE

Reports are stored inside the browser’s localStorage using:

   smartroadReports

This means the project can work without a backend during the
hackathon/demo.

MAP

The homepage uses Leaflet + OpenStreetMap.

Leaflet is a free/open-source JavaScript mapping library.
OpenStreetMap provides the map tiles.

================================================================ */

/* ================================================================

1. GLOBAL CONFIGURATION
    ================================================================ */

/*
The localStorage key used by the entire application.

All pages use the same key so that a report submitted on
report.html immediately becomes available on index.html
and issues.html.

*/
const STORAGE_KEY = "smartroadReports";

/*
UI-polish helpers added for the redesign:
- toast notifications (replaces jarring alert() popups)
- animated number count-up for statistics
- mobile navigation menu toggle
These do not change any data logic above/below.
*/

/*
Default map position.

These coordinates point to central Delhi.

*/
const DELHI_CENTER = [28.6139, 77.2090];

/*
TomTom API key — powers the live traffic flow overlay on the
map and the live congestion readings in the traffic dashboard.

NOTE ON SECURITY: this key lives in client-side JavaScript,
so anyone who views the page source can see it. That's the
normal way TomTom's web/map keys are used (the Maps SDK for
Web is designed to run in the browser), but it does mean you
should go to your TomTom developer dashboard and restrict this
key to your own domain(s) before putting the site on the public
internet — otherwise someone else could copy it and use up your
request quota.
*/
const TOMTOM_API_KEY = "vBMi8Jld70Jpo7P44m4yfWQsU9DwAaPl";

/*
Locations shown in the "current hotspots" traffic dashboard.
Each one is matched to a .traffic-row in the HTML via
data-lat / data-lon attributes, so no ids are needed per row.
*/
const TRAFFIC_REFRESH_MS = 2 * 60 * 1000; // refresh every 2 minutes

/* ================================================================
2. GENERAL DATA FUNCTIONS
================================================================ */

/*
Get all saved reports from localStorage.

localStorage stores everything as text, so JSON.parse()
converts the stored string back into a JavaScript array.

*/
function getReports() {

const storedReports = localStorage.getItem(STORAGE_KEY);
/*
    If there is no saved data yet, return an empty array.
*/
if (!storedReports) {
    return [];
}
/*
    JSON can occasionally become invalid if localStorage
    was manually edited or corrupted.
    try/catch prevents the entire website from crashing.
*/
try {
    return JSON.parse(storedReports);
} catch (error) {
    console.error("Could not read SmartRoad reports:", error);
    return [];
}

}

/*
Save the complete reports array back to localStorage.
*/
function saveReports(reports) {

localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(reports)
);

}

/*
Create a simple unique ID for every report.

Date.now() gives us the current timestamp and Math.random()
adds another small layer of uniqueness.

*/
function createReportId() {

return (
    Date.now().toString() +
    "-" +
    Math.random().toString(36).substring(2, 8)
);

}

/* ================================================================
3. HTML SAFETY
================================================================ */

/*
User-entered text should NEVER be inserted directly into
innerHTML.

This function converts characters such as:
    <
    >
    "
    '
into safe HTML entities.
This prevents a user from accidentally or intentionally
injecting HTML/JavaScript into the issue dashboard.

*/
function escapeHTML(value) {

if (value === null || value === undefined) {
    return "";
}
return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}

/* ================================================================
4. PRIORITY CALCULATION
================================================================ */

/*
SmartRoad assigns a numerical priority score to every report.

Higher scores mean the issue should receive more attention.
Severity contributes most of the score.
Certain road problems receive an additional safety bonus.

*/
function calculatePriority(report) {

let score = 0;
/* Severity score */
const severityScores = {
    Low: 20,
    Medium: 45,
    High: 70,
    Critical: 100
};
score += severityScores[report.severity] || 0;
/*
    Safety-critical problem types get a small additional
    priority boost.
*/
const safetyProblems = [
    "Traffic Signal",
    "Road Damage",
    "Flooding"
];
if (safetyProblems.includes(report.problemType)) {
    score += 10;
}
/*
    Cap the score at 100.
*/
return Math.min(score, 100);

}

/*
Convert the numerical priority into a category.

This category is used for:
- map marker colors
- issue card styling
- priority labels

*/
function getPriorityCategory(score) {

if (score >= 90) {
    return "Critical";
}
if (score >= 65) {
    return "High";
}
if (score >= 40) {
    return "Medium";
}
return "Low";

}

/* ================================================================
5. DATE FORMATTING
================================================================ */

/*
Convert an ISO timestamp into a readable date.

Example:
    2026-09-03T14:30:00
becomes something like:
    03 Sep 2026, 14:30

*/
function formatDate(dateValue) {

if (!dateValue) {
    return "Unknown date";
}
const date = new Date(dateValue);
if (Number.isNaN(date.getTime())) {
    return "Unknown date";
}
return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

}

/* ================================================================
6. HOMEPAGE STATISTICS
================================================================ */

/*
Update the statistics shown on index.html and issues.html.

The function checks which elements actually exist before
changing them.
This is important because the same script.js file is loaded
on multiple pages.

*/
function updateStatistics() {

const reports = getReports();
/* Count all reports */
const total = reports.length;
/* Count reports that are not fixed */
const open = reports.filter(
    report => report.status !== "Fixed"
).length;
/* Count only active critical reports; resolved problems are not active. */
const critical = reports.filter(
    report =>
        report.priorityCategory === "Critical" &&
        report.status !== "Fixed"
).length;
/* Count fixed reports */
const fixed = reports.filter(
    report => report.status === "Fixed"
).length;
/*
    Helper function.
    It only updates an element if that element exists
    on the current page.

    Numeric values animate with a short count-up instead of
    snapping instantly, which makes the dashboards feel alive.
*/
function updateElement(id, value) {
    const element = document.getElementById(id);
    if (!element) {
        return;
    }
    if (typeof value === "number") {
        animateNumber(element, value);
    } else {
        element.textContent = value;
    }
}
updateElement("total-reports", total);
updateElement("open-reports", open);
updateElement("critical-reports", critical);
updateElement("fixed-reports", fixed);
updateElement("hero-report-count", total);
/* The map contains active (not fixed) reports only. */
updateElement("map-report-count", open);

}

/* ================================================================
6b. NUMBER COUNT-UP ANIMATION
================================================================ */

/*
Animate a number from its current displayed value up (or down)
to a new value. Purely visual — falls back to an instant update
if the browser has requested reduced motion.
*/
function animateNumber(element, newValue) {

const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const startValue =
    parseInt(element.textContent, 10) || 0;
if (prefersReducedMotion || startValue === newValue) {
    element.textContent = newValue;
    return;
}
const duration = 500;
const startTime = performance.now();

function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    /* Ease-out for a natural deceleration. */
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(
        startValue + (newValue - startValue) * eased
    );
    element.textContent = current;
    if (progress < 1) {
        requestAnimationFrame(step);
    }
}
requestAnimationFrame(step);

}

/* ================================================================
6c. TOAST NOTIFICATIONS
================================================================ */

/*
Lightweight toast notifications used in place of alert(),
so confirmations don't block the page with a native dialog.
*/
function showToast(message, type) {

let container =
    document.querySelector(".toast-container");
if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
}
const toast =
    document.createElement("div");
toast.className =
    "toast" + (type ? " " + type : "");
toast.textContent = message;
container.appendChild(toast);
setTimeout(function () {
    toast.classList.add("leaving");
    setTimeout(function () {
        toast.remove();
    }, 250);
}, 3200);

}

/* ================================================================
6d. MOBILE NAVIGATION
================================================================ */

/*
Toggle the mobile navigation menu.
Runs on every page, since every page shares the same navbar markup.
*/
function initializeMobileNav() {

const navbar =
    document.getElementById("navbar");
const toggle =
    document.getElementById("nav-toggle");
const links =
    document.getElementById("nav-links");
if (!navbar || !toggle || !links) {
    return;
}
toggle.addEventListener("click", function () {
    const isOpen =
        navbar.classList.toggle("nav-open");
    toggle.setAttribute(
        "aria-expanded",
        isOpen ? "true" : "false"
    );
    toggle.setAttribute(
        "aria-label",
        isOpen ? "Close menu" : "Open menu"
    );
});
/*
    Close the menu automatically once a link is chosen.
*/
links.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
        navbar.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
    });
});

}

/* ================================================================
6e. SCROLL PROGRESS BAR
================================================================ */

/*
A thin "distance travelled" bar fixed to the top of the viewport,
filling as the visitor scrolls down the page.
*/
function initializeScrollProgress() {

const track = document.createElement("div");
track.id = "scroll-progress";
const fill = document.createElement("div");
fill.id = "scroll-progress-fill";
track.appendChild(fill);
document.body.appendChild(track);

function update() {
    const scrollTop =
        window.scrollY || document.documentElement.scrollTop;
    const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
    const percent =
        docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
    fill.style.width = Math.min(100, Math.max(0, percent)) + "%";
}

let ticking = false;
window.addEventListener("scroll", function () {
    if (!ticking) {
        requestAnimationFrame(function () {
            update();
            ticking = false;
        });
        ticking = true;
    }
});
window.addEventListener("resize", update);
update();

}

/* ================================================================
6f. SCROLL-TRIGGERED REVEALS
================================================================ */

/*
Fades and lifts key sections into place as they enter the
viewport. Applied programmatically so no markup changes are
needed on any page.
*/
function initializeScrollReveal() {

const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const selectors = [
    ".section-heading",
    ".report-grid > *",
    ".traffic-dashboard",
    ".map-panel",
    ".map-actions",
    ".step-card",
    ".cta-content",
    ".issue-stat-card",
    ".filters-panel",
    ".issue-card",
    ".sidebar-card",
    ".sidebar-alert",
    ".form-panel"
];

const targets = document.querySelectorAll(selectors.join(","));
if (targets.length === 0) {
    return;
}

targets.forEach(function (el, index) {
    el.classList.add("reveal");
    el.style.transitionDelay = (index % 4) * 0.08 + "s";
});

if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) {
        el.classList.add("in-view");
    });
    return;
}

const observer = new IntersectionObserver(
    function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    },
    { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
);

targets.forEach(function (el) {
    observer.observe(el);
});

}

/*
Reports are rendered dynamically after the reveal observer has
already run, so newly created issue cards get their own
lightweight reveal-in effect.
*/
function revealNewCard(card) {

const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReducedMotion) {
    return;
}
card.classList.add("reveal");
requestAnimationFrame(function () {
    requestAnimationFrame(function () {
        card.classList.add("in-view");
    });
});

}

/* ================================================================
6g. 3D TILT ON HOVER
================================================================ */

/*
Adds a subtle perspective tilt that follows the cursor across
a card, for a tactile, dimensional feel. Skipped on touch
devices and when reduced motion is requested.
*/
function tiltIsSupported() {
    const prefersReducedMotion =
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isCoarsePointer =
        window.matchMedia &&
        window.matchMedia("(pointer: coarse)").matches;
    return !prefersReducedMotion && !isCoarsePointer;
}

function attachTilt(card) {

if (!tiltIsSupported() || card.dataset.tiltReady === "true") {
    return;
}
card.dataset.tiltReady = "true";
const maxTilt = 8;

card.addEventListener("mousemove", function (event) {
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - y) * maxTilt * 2;
    card.classList.add("is-tilting");
    card.style.transform =
        "perspective(900px) rotateX(" + rotateX +
        "deg) rotateY(" + rotateY + "deg) translateY(-2px)";
});

card.addEventListener("mouseleave", function () {
    card.classList.remove("is-tilting");
    card.style.transform = "";
});

}

function initializeTiltEffect() {

if (!tiltIsSupported()) {
    return;
}
const tiltTargets = document.querySelectorAll(
    ".hero-card, .report-preview, .issue-card, .step-card, .sidebar-card"
);
tiltTargets.forEach(attachTilt);

}

/* ================================================================
6h. HERO ROAD PARALLAX
================================================================ */

/*
As the visitor scrolls past the hero, the illustrated road drifts
slightly, adding a touch of depth to an otherwise static visual.
*/
function initializeHeroParallax() {

const road = document.querySelector(".road");
const hero = document.querySelector(".hero");
if (!road || !hero) {
    return;
}
const prefersReducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
if (prefersReducedMotion) {
    return;
}

let ticking = false;
window.addEventListener("scroll", function () {
    if (ticking) {
        return;
    }
    requestAnimationFrame(function () {
        const rect = hero.getBoundingClientRect();
        const offset = Math.max(-40, Math.min(40, rect.top * -0.08));
        road.style.transform =
            "translateX(-50%) perspective(280px) rotateX(48deg) translateY(" +
            offset + "px)";
        ticking = false;
    });
    ticking = true;
});

}

/* ================================================================
7. REPORT FORM
================================================================ */

/*
Set up the report form.

This function only runs when report.html is open.

*/
function initializeReportForm() {

const form = document.getElementById("report-form");
/*
    If the form doesn't exist, we're probably on index.html
    or issues.html, so there is nothing to initialize.
*/
if (!form) {
    return;
}
/* ------------------------------------------------------------
   FORM SUBMISSION
   ------------------------------------------------------------ */
form.addEventListener("submit", async function (event) {
    /*
        Prevent the browser from reloading the page.
    */
    event.preventDefault();
    /* Get form values */
    const problemType =
        document.getElementById("problem-type").value;
    const severity =
        document.getElementById("severity").value;
    const area =
        document.getElementById("area").value.trim();
    const city =
        document.getElementById("city").value.trim();
    const description =
        document.getElementById("description").value.trim();
    /*
        Read GPS coordinates if they were supplied.
    */
    const latitude =
        document.getElementById("latitude").value;
    const longitude =
        document.getElementById("longitude").value;
    /*
        Basic validation.
        The HTML required attributes already perform validation,
        but this additional check makes the JavaScript safer.
    */
    if (
        !problemType ||
        !severity ||
        !area ||
        !city ||
        !description
    ) {
        showFormMessage(
            "Please complete all required fields.",
            "error"
        );
        return;
    }
    /* --------------------------------------------------------
       LOCATION
       -------------------------------------------------------- */
    /*
        GPS is optional. When it is not available, convert the
        entered area and city into map coordinates before saving so
        manually reported issues are visible on the issue map too.
    */
    const hasGpsCoordinates =
        latitude !== "" &&
        longitude !== "" &&
        Number.isFinite(Number(latitude)) &&
        Number.isFinite(Number(longitude));
    let reportLatitude =
        hasGpsCoordinates ? Number(latitude) : null;
    let reportLongitude =
        hasGpsCoordinates ? Number(longitude) : null;
    if (!hasGpsCoordinates) {
        const locationStatus =
            document.getElementById("location-status");
        if (locationStatus) {
            locationStatus.textContent =
                "FINDING THE ENTERED LOCATION...";
        }
        try {
            const coordinates = await geocodeReportLocation(area, city);
            reportLatitude = coordinates.latitude;
            reportLongitude = coordinates.longitude;
            if (locationStatus) {
                locationStatus.textContent =
                    (coordinates.isCityFallback
                        ? "AREA NOT FOUND — MARKED IN " + city.toUpperCase() + ": "
                        : "LOCATION FOUND FROM AREA: ") +
                    reportLatitude.toFixed(5) + ", " +
                    reportLongitude.toFixed(5);
            }
        } catch (error) {
            console.error("Could not find the entered location:", error);
            showFormMessage(
                "We could not find that area. Please check the area and city, then try again.",
                "error"
            );
            return;
        }
    }
    /* --------------------------------------------------------
       IMAGE
       -------------------------------------------------------- */
    const imageInput =
        document.getElementById("image");
    /*
        Images are stored as Base64 strings.
        This is acceptable for a small hackathon demo, but
        production applications should store images on a
        proper storage service instead.
    */
    const selectedFile =
        imageInput &&
        imageInput.files &&
        imageInput.files[0];
    /*
        Create the report without the image first.
        If there is an image, FileReader will add it later.
    */
    const newReport = {
        id: createReportId(),
        problemType: problemType,
        severity: severity,
        area: area,
        city: city,
        description: description,
        latitude: reportLatitude,
        longitude: reportLongitude,
        status: "Open",
        createdAt: new Date().toISOString(),
        image: null
    };
    /*
        Calculate priority before saving.
    */
    newReport.priorityScore =
        calculatePriority(newReport);
    newReport.priorityCategory =
        getPriorityCategory(
            newReport.priorityScore
        );
    /*
        If the user selected an image, convert it to Base64
        before saving.
    */
    if (selectedFile) {
        const reader = new FileReader();
        reader.onload = function () {
            newReport.image = reader.result;
            saveNewReport(newReport);
        };
        reader.onerror = function () {
            console.error(
                "Could not read the selected image."
            );
            /*
                Save the report anyway, even if the image
                could not be processed.
            */
            saveNewReport(newReport);
        };
        reader.readAsDataURL(selectedFile);
    } else {
        /*
            No image was selected, so save immediately.
        */
        saveNewReport(newReport);
    }
});
/* ------------------------------------------------------------
   IMAGE PREVIEW
   ------------------------------------------------------------ */
initializeImagePreview();
/* ------------------------------------------------------------
   GPS LOCATION
   ------------------------------------------------------------ */
initializeGeolocation();

}

/*
Find coordinates for a typed area when the reporter chooses not to
share GPS. Nominatim uses OpenStreetMap's place data, the same mapping
ecosystem used by the Leaflet map. A city-only fallback still keeps the
report visible if a locality is too new or is spelled differently.
*/
async function geocodeReportLocation(area, city) {

const searches = [
    area + ", " + city + ", India",
    area + ", " + city,
    city + ", India"
];
for (let index = 0; index < searches.length; index++) {
    const query = searches[index];
    const response = await fetch(
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
            encodeURIComponent(query),
        { headers: { "Accept": "application/json" } }
    );
    if (!response.ok) {
        continue;
    }
    const matches = await response.json();
    const match = matches && matches[0];
    const latitude = match ? Number(match.lat) : NaN;
    const longitude = match ? Number(match.lon) : NaN;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        return {
            latitude: latitude,
            longitude: longitude,
            isCityFallback: index === searches.length - 1
        };
    }
}
throw new Error("No matching location found.");

}

/*
Save a newly created report.
*/
function saveNewReport(report) {

const reports = getReports();
/*
    Add the newest report to the beginning of the array
    so the latest report appears first.
*/
reports.unshift(report);
saveReports(reports);
updateStatistics();
showFormMessage(
    "REPORT SUBMITTED SUCCESSFULLY. YOUR ISSUE HAS BEEN ADDED TO SMARTROAD.",
    "success"
);
/* Briefly show confirmation, then take the reporter to the active issues. */
setTimeout(function () {
    window.location.href = "issues.html";
}, 700);
/*
    Reset the form after successful submission.
    We wait briefly so the success message can be seen.
*/
const form = document.getElementById("report-form");
setTimeout(function () {
    if (form) {
        form.reset();
    }
    /*
        Reset the default city after form.reset().
    */
    const cityInput =
        document.getElementById("city");
    if (cityInput) {
        cityInput.value = "Delhi";
    }
    /*
        Clear coordinates.
    */
    const latitude =
        document.getElementById("latitude");
    const longitude =
        document.getElementById("longitude");
    if (latitude) {
        latitude.value = "";
    }
    if (longitude) {
        longitude.value = "";
    }
    /*
        Reset location status.
    */
    const locationStatus =
        document.getElementById("location-status");
    if (locationStatus) {
        locationStatus.textContent =
            "LOCATION NOT SET";
    }
    /*
        Clear image preview.
    */
    const preview =
        document.getElementById("image-preview");
    if (preview) {
        preview.innerHTML = "";
    }
}, 1500);

}

/*
Display a success or error message below the report form.
*/
function showFormMessage(message, type) {

const messageElement =
    document.getElementById("form-message");
if (!messageElement) {
    return;
}
messageElement.textContent = message;
messageElement.className =
    "form-message " + type;

}

/* ================================================================
8. IMAGE PREVIEW
================================================================ */

/*
Show a preview when the user selects a road image.
*/
function initializeImagePreview() {

const input =
    document.getElementById("image");
const preview =
    document.getElementById("image-preview");
if (!input || !preview) {
    return;
}
input.addEventListener("change", function () {
    preview.innerHTML = "";
    const file =
        input.files && input.files[0];
    if (!file) {
        return;
    }
    /*
        Only allow image files.
    */
    if (!file.type.startsWith("image/")) {
        preview.textContent =
            "Please select a valid image file.";
        return;
    }
    const reader =
        new FileReader();
    reader.onload = function (event) {
        const image =
            document.createElement("img");
        image.src =
            event.target.result;
        image.alt =
            "Preview of uploaded road issue";
        preview.appendChild(image);
    };
    reader.readAsDataURL(file);
});

}

/* ================================================================
9. BROWSER GEOLOCATION
================================================================ */

/*
Set up the “GET LOCATION” button.

The browser will ask the user for permission to access
their current location.

*/
function initializeGeolocation() {

const button =
    document.getElementById("get-location");
if (!button) {
    return;
}
button.addEventListener("click", function () {
    const status =
        document.getElementById("location-status");
    /*
        Check whether the browser supports geolocation.
    */
    if (!navigator.geolocation) {
        if (status) {
            status.textContent =
                "GPS NOT SUPPORTED BY THIS BROWSER";
        }
        return;
    }
    if (status) {
        status.textContent =
            "GETTING YOUR LOCATION...";
    }
    /*
        Ask the browser for the current position.
    */
    navigator.geolocation.getCurrentPosition(
        function (position) {
            const latitude =
                position.coords.latitude;
            const longitude =
                position.coords.longitude;
            /*
                Store the coordinates inside the hidden
                form fields.
            */
            document.getElementById("latitude").value =
                latitude;
            document.getElementById("longitude").value =
                longitude;
            if (status) {
                status.textContent =
                    "LOCATION SET: " +
                    latitude.toFixed(5) +
                    ", " +
                    longitude.toFixed(5);
            }
        },
        function (error) {
            console.error(
                "Geolocation error:",
                error
            );
            if (status) {
                status.textContent =
                    "COULD NOT GET LOCATION";
            }
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 60000
        }
    );
});

}

/* ================================================================
10. ISSUES PAGE
================================================================ */

/*
Initialize the issue database.

This function runs only when reports-container exists.

*/
function initializeIssuesPage() {

const container =
    document.getElementById("reports-container");
if (!container) {
    return;
}
/*
    Get filter elements.
*/
const typeFilter =
    document.getElementById("filter-type");
const severityFilter =
    document.getElementById("filter-severity");
const statusFilter =
    document.getElementById("filter-status");
/*
    Refresh the issue list whenever a filter changes.
*/
if (typeFilter) {
    typeFilter.addEventListener(
        "change",
        renderIssueCards
    );
}
if (severityFilter) {
    severityFilter.addEventListener(
        "change",
        renderIssueCards
    );
}
if (statusFilter) {
    statusFilter.addEventListener(
        "change",
        renderIssueCards
    );
}
/*
    Clear all reports button.
*/
const clearButton =
    document.getElementById("clear-reports");
if (clearButton) {
    clearButton.addEventListener(
        "click",
        clearAllReports
    );
}
/*
    Draw the initial list.
*/
renderIssueCards();

}

/* ================================================================
11. ISSUE FILTERING
================================================================ */

/*
Return reports matching the currently selected filters.
*/
function getFilteredReports() {

const reports = getReports();
const typeFilter =
    document.getElementById("filter-type");
const severityFilter =
    document.getElementById("filter-severity");
const statusFilter =
    document.getElementById("filter-status");
const selectedType =
    typeFilter
        ? typeFilter.value
        : "all";
const selectedSeverity =
    severityFilter
        ? severityFilter.value
        : "all";
const selectedStatus =
    statusFilter
        ? statusFilter.value
        : "all";
return reports.filter(function (report) {
    const typeMatches =
        selectedType === "all" ||
        report.problemType === selectedType;
    const severityMatches =
        selectedSeverity === "all" ||
        report.severity === selectedSeverity;
    const statusMatches =
        selectedStatus === "all"
            ? report.status !== "Fixed"
            : report.status === selectedStatus;
    return (
        typeMatches &&
        severityMatches &&
        statusMatches
    );
});

}

/* ================================================================
12. RENDER ISSUE CARDS
================================================================ */

/*
Create all issue cards shown on issues.html.
*/
function renderIssueCards() {

const container =
    document.getElementById("reports-container");
if (!container) {
    return;
}
const reports =
    getFilteredReports();
container.innerHTML = "";
/*
    Update visible-result counter.
*/
const resultsCount =
    document.getElementById("results-count");
if (resultsCount) {
    resultsCount.textContent =
        reports.length;
}
/*
    Show/hide the empty-state message.
*/
const emptyMessage =
    document.getElementById("no-reports");
if (emptyMessage) {
    emptyMessage.style.display =
        reports.length === 0
            ? "block"
            : "none";
}
/*
    Create one card for every matching report.
*/
reports.forEach(function (report) {
    const card =
        createIssueCard(report);
    container.appendChild(card);
    revealNewCard(card);
    attachTilt(card);
});
updateStatistics();

}

/*
Create one issue card as a DOM element.

Using createElement instead of directly injecting user content
into innerHTML gives us more control over safe rendering.

*/
function createIssueCard(report) {

const card =
    document.createElement("article");
card.className =
    "issue-card";
/*
    Priority category controls the visual styling.
*/
card.classList.add(
    "priority-" +
    String(
        report.priorityCategory || "Low"
    ).toLowerCase()
);
const imageHTML =
    report.image
        ? `
            <div class="issue-image">
                <img
                    src="${escapeHTML(report.image)}"
                    alt="Road issue photo"
                >
            </div>
          `
        : "";
const resolutionDeadline =
    Number(report.resolutionPendingUntil) || 0;
const isResolving =
    report.status === "In Progress" &&
    resolutionDeadline > Date.now();
const resolutionTimerHTML = isResolving
    ? `
        <div class="resolution-timer" data-resolution-timer="${escapeHTML(report.id)}">
            PASSING THIS ISSUE TO RESOLVED IN <strong>30</strong>S
        </div>
      `
    : "";
/*
    Build the card.
    All user-generated text is passed through escapeHTML().
*/
card.innerHTML = `
    ${imageHTML}
    <div class="issue-card-content">
        <div class="issue-card-top">
            <span class="issue-type">
                ${escapeHTML(report.problemType)}
            </span>
            <span class="issue-priority">
                ${escapeHTML(
                    report.priorityCategory || "Low"
                )}
            </span>
        </div>
        <h3>
            ${escapeHTML(report.area)}
        </h3>
        <div class="issue-location">
            ${escapeHTML(report.city)}
            ${
                report.latitude && report.longitude
                    ? `
                        ·
                        ${Number(report.latitude).toFixed(4)},
                        ${Number(report.longitude).toFixed(4)}
                      `
                    : ""
            }
        </div>
        <p class="issue-description">
            ${escapeHTML(report.description)}
        </p>
        ${resolutionTimerHTML}
        <div class="issue-card-meta">
            <span class="severity-badge">
                ${escapeHTML(report.severity)}
            </span>
            <span class="status-badge">
                ${escapeHTML(report.status)}
            </span>
            <span class="issue-date">
                ${escapeHTML(
                    formatDate(report.createdAt)
                )}
            </span>
        </div>
        <div class="issue-card-footer">
            <span>
                PRIORITY SCORE:
                <strong>
                    ${Number(
                        report.priorityScore || 0
                    )}
                </strong>
            </span>
            <button
                type="button"
                class="status-toggle"
                data-report-id="${escapeHTML(report.id)}"
            >
                UPDATE STATUS →
            </button>
        </div>
    </div>
`;
/*
    Status button allows the demo user to move a report
    through:
        Open
          ↓
    In Progress
          ↓
       Fixed
*/
const statusButton =
    card.querySelector(".status-toggle");
if (statusButton) {
    statusButton.textContent =
        isResolving
            ? "UNDO RESOLUTION →"
            : report.status === "Open"
                ? "START WORK →"
                : report.status === "In Progress"
                    ? "MARK AS RESOLVED →"
                    : "REOPEN ISSUE →";
    statusButton.addEventListener(
        "click",
        function () {
            cycleReportStatus(report.id);
        }
    );
}
if (isResolving) {
    startResolutionCountdown(report.id, resolutionDeadline);
}
return card;

}

/* ================================================================
13. STATUS MANAGEMENT
================================================================ */

/*
Move a report through its workflow. Resolution has a visible 30-second
handoff period before the report is archived as Fixed.
*/
const resolutionCountdowns = new Map();

function cycleReportStatus(reportId) {

const reports =
    getReports();
const report =
    reports.find(
        item => item.id === reportId
    );
if (!report) {
    return;
}
if (report.status === "Open") {
    report.status = "In Progress";
} else if (report.status === "In Progress") {
    if (report.resolutionPendingUntil) {
        cancelResolutionCountdown(reportId);
        delete report.resolutionPendingUntil;
        showToast("Resolution cancelled. The issue remains in progress.", "success");
    } else {
        report.resolutionPendingUntil = Date.now() + 30000;
    }
} else {
    /*
        If the issue is already fixed, cycle back to Open.
    */
    report.status = "Open";
    delete report.resolutionPendingUntil;
}

saveReports(reports);
/*
    Refresh both statistics and cards.
*/
updateStatistics();
renderIssueCards();
/* Remove a resolved report from the homepage map immediately. */
if (typeof window.refreshSmartRoadMap === "function") {
    window.refreshSmartRoadMap();
}

}

function startResolutionCountdown(reportId, deadline) {

if (resolutionCountdowns.has(reportId)) {
    return;
}
function tick() {
    const secondsLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const timer = document.querySelector(
        '[data-resolution-timer="' + reportId + '"] strong'
    );
    if (timer) {
        timer.textContent = secondsLeft;
    }
    if (secondsLeft > 0) {
        return;
    }
    clearInterval(resolutionCountdowns.get(reportId));
    resolutionCountdowns.delete(reportId);
    completeResolution(reportId);
}
resolutionCountdowns.set(reportId, setInterval(tick, 1000));
tick();

}

function cancelResolutionCountdown(reportId) {

const countdown = resolutionCountdowns.get(reportId);
if (countdown) {
    clearInterval(countdown);
    resolutionCountdowns.delete(reportId);
}

}

function completeResolution(reportId) {

const reports = getReports();
const report = reports.find(item => item.id === reportId);
if (!report || !report.resolutionPendingUntil) {
    return;
}
report.status = "Fixed";
delete report.resolutionPendingUntil;
saveReports(reports);
updateStatistics();
renderIssueCards();
refreshSmartRoadMap();
showToast("Issue moved to resolved.", "success");

}

function resolveExpiredReports() {

const reports = getReports();
let changed = false;
reports.forEach(function (report) {
    if (
        report.resolutionPendingUntil &&
        Number(report.resolutionPendingUntil) <= Date.now()
    ) {
        report.status = "Fixed";
        delete report.resolutionPendingUntil;
        changed = true;
    }
});
if (changed) {
    saveReports(reports);
}

}

/* ================================================================
14. CLEAR REPORTS
================================================================ */

/*
Delete all locally stored reports.

A confirmation box prevents accidental deletion.

*/
function clearAllReports() {

const reports =
    getReports();
if (reports.length === 0) {
    showToast("There are no reports to clear.", "error");
    return;
}
const confirmed =
    confirm(
        "Are you sure you want to delete all SmartRoad reports?"
    );
if (!confirmed) {
    return;
}
localStorage.removeItem(STORAGE_KEY);
updateStatistics();
renderIssueCards();
/*
    If the homepage map exists, refresh its markers.
*/
if (typeof window.refreshSmartRoadMap === "function") {
    window.refreshSmartRoadMap();
}
showToast("All SmartRoad reports were cleared.", "success");

}

/* ================================================================
15. LEAFLET MAP
================================================================ */

/*
The map variable is kept outside initializeMap() so that
other functions can refresh the markers later.
*/
let smartRoadMap = null;

/*
Layer containing all SmartRoad report markers.
*/
let reportMarkerLayer = null;

/*
Live-updates the "current hotspots" traffic dashboard on
index.html using TomTom's Traffic Flow Segment Data API.

Each .traffic-row in the HTML carries data-lat / data-lon
attributes; this function looks up real-time congestion for
that point, fills in the bar/color/status word, and then
re-sorts the rows so the most congested location is actually
the one shown on top — the ranking reflects the live readings
instead of the fixed order the rows happen to be written in
the HTML.
*/
function initializeLiveTrafficDashboard() {

const list =
    document.querySelector(".traffic-list");
const rows = Array.from(
    document.querySelectorAll(".traffic-row[data-lat]")
);
if (!list || rows.length === 0) {
    return;
}

function describeCongestion(percent) {
    if (percent >= 70) {
        return { label: "Heavy", barClass: "critical", statusClass: "critical-text" };
    }
    if (percent >= 45) {
        return { label: "Busy", barClass: "heavy", statusClass: "" };
    }
    if (percent >= 20) {
        return { label: "Moderate", barClass: "moderate", statusClass: "" };
    }
    return { label: "Clear", barClass: "clear", statusClass: "green-text" };
}

/*
    Fetch live congestion for one row and update its bar,
    color and status word. Resolves with the congestion
    percentage (or null if the reading is unavailable) so
    refreshAll() can rank the rows once every request settles.
*/
function updateRow(row) {

    const bar =
        row.querySelector(".traffic-progress");
    const status =
        row.querySelector(".traffic-status");
    const lat = row.dataset.lat;
    const lon = row.dataset.lon;
    if (!bar || !status || !lat || !lon) {
        return Promise.resolve({ row: row, congestion: null });
    }
    const url =
        "https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=" +
        lat + "," + lon + "&key=" + TOMTOM_API_KEY;

    return fetch(url)
        .then(function (response) {
            if (!response.ok) {
                throw new Error("TomTom flow request failed");
            }
            return response.json();
        })
        .then(function (data) {
            const segment =
                data && data.flowSegmentData;
            if (
                !segment ||
                typeof segment.currentSpeed !== "number" ||
                typeof segment.freeFlowSpeed !== "number" ||
                segment.freeFlowSpeed <= 0
            ) {
                throw new Error("Unexpected TomTom response shape");
            }
            const congestion = Math.round(
                Math.max(
                    0,
                    Math.min(
                        100,
                        (1 - segment.currentSpeed / segment.freeFlowSpeed) * 100
                    )
                )
            );
            const info = describeCongestion(congestion);
            bar.style.width = congestion + "%";
            bar.className = "traffic-progress " + info.barClass;
            status.textContent = info.label;
            status.className =
                "traffic-status" + (info.statusClass ? " " + info.statusClass : "");
            return { row: row, congestion: congestion };
        })
        .catch(function () {
            /*
                If the request fails (offline, invalid key,
                rate limit, blocked network) leave the row's
                last known value in place rather than breaking
                the page, and leave it out of the ranking.
            */
            status.textContent = status.textContent || "Unavailable";
            return { row: row, congestion: null };
        });

}

/*
    Re-order the rows in the DOM so the highest live congestion
    is shown first, and renumber the "01 / 02 / 03…" index badges
    to match the new order. Rows with no reading yet (or a failed
    request) are left at the bottom rather than blocking the sort.
*/
function reorderByCongestion(results) {
    const sorted = results
        .slice()
        .sort(function (a, b) {
            if (a.congestion === null && b.congestion === null) return 0;
            if (a.congestion === null) return 1;
            if (b.congestion === null) return -1;
            return b.congestion - a.congestion;
        });
    sorted.forEach(function (result, index) {
        list.appendChild(result.row);
        const indexBadge =
            result.row.querySelector(".traffic-index");
        if (indexBadge) {
            indexBadge.textContent =
                String(index + 1).padStart(2, "0");
        }
    });
}

function refreshAll() {
    Promise.all(rows.map(updateRow)).then(reorderByCongestion);
    const updatedLabel =
        document.getElementById("traffic-updated");
    if (updatedLabel) {
        const now = new Date();
        updatedLabel.textContent =
            "Updated " +
            now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
}

refreshAll();
setInterval(refreshAll, TRAFFIC_REFRESH_MS);

}

/*
Initialize the Leaflet map on index.html.
*/
function initializeMap() {

const mapElement =
    document.getElementById("city-map");
/*
    If there is no map element, we're not on index.html.
*/
if (!mapElement) {
    return;
}
/*
    Check whether Leaflet loaded correctly.
    If the internet connection is unavailable or the CDN
    fails, the website should not completely crash.
*/
if (typeof L === "undefined") {
    console.error(
        "Leaflet could not be loaded."
    );
    mapElement.innerHTML = `
        <div class="map-error">
            <strong>
                MAP UNAVAILABLE
            </strong>
            <p>
                Please check your internet connection
                and reload the page.
            </p>
        </div>
    `;
    return;
}
/*
    Create the map.
    setView() controls:
    - starting coordinates
    - starting zoom level
*/
smartRoadMap =
    L.map("city-map").setView(
        DELHI_CENTER,
        12
    );
/*
    OpenStreetMap tile layer.
    OpenStreetMap is free to use under its applicable
    attribution/licensing requirements.
    The attribution is displayed in the bottom-right
    corner of the map.
*/
L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution:
            '&copy; OpenStreetMap contributors'
    }
).addTo(smartRoadMap);
/*
    TomTom live traffic overlays.
    "Flow" colors road segments by how congested they
    currently are. "Incidents" marks accidents, roadworks
    and closures. Both sit on top of the OpenStreetMap
    base layer and refresh automatically as TomTom's own
    tiles update.
*/
const tomtomFlowLayer = L.tileLayer(
    "https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=" +
        TOMTOM_API_KEY,
    {
        maxZoom: 22,
        attribution: '&copy; TomTom'
    }
);
const tomtomIncidentsLayer = L.tileLayer(
    "https://api.tomtom.com/traffic/map/4/tile/incidents/s3/{z}/{x}/{y}.png?key=" +
        TOMTOM_API_KEY +
        "&tileSize=256",
    {
        maxZoom: 22,
        attribution: '&copy; TomTom'
    }
);
/*
    Traffic flow is on by default so the map feels alive
    as soon as it loads. Incidents can be switched on from
    the layer control in the top-right of the map.
*/
tomtomFlowLayer.addTo(smartRoadMap);
L.control
    .layers(
        null,
        {
            "Live traffic flow": tomtomFlowLayer,
            "Traffic incidents": tomtomIncidentsLayer
        },
        { collapsed: false }
    )
    .addTo(smartRoadMap);
/*
    Create a separate layer for our report markers.
    Keeping markers in a layer group allows us to remove
    and redraw them without destroying the map itself.
*/
reportMarkerLayer =
    L.layerGroup().addTo(smartRoadMap);
/*
    Draw existing reports.
*/
refreshSmartRoadMap();
/*
    Leaflet sometimes needs a size recalculation after the
    surrounding layout has finished rendering.
*/
setTimeout(function () {
    smartRoadMap.invalidateSize();
}, 200);

}

/* ================================================================
16. MAP MARKERS
================================================================ */

/*
Remove old markers and draw the latest report locations.
*/
function refreshSmartRoadMap() {

/*
    If the map has not been initialized yet, stop here.
*/
if (
    !smartRoadMap ||
    !reportMarkerLayer
) {
    return;
}
/*
    Remove previous markers.
*/
reportMarkerLayer.clearLayers();
const reports =
    getReports();
let mappedReports = 0;
reports.forEach(function (report) {
    /* Resolved issues are intentionally not shown on the active map. */
    if (report.status === "Fixed") {
        return;
    }
    /*
        A report needs valid coordinates before it can
        appear on the map.
    */
    if (
        typeof report.latitude !== "number" ||
        typeof report.longitude !== "number" ||
        Number.isNaN(report.latitude) ||
        Number.isNaN(report.longitude)
    ) {
        return;
    }
    /*
        Determine marker category.
    */
    const category =
        report.priorityCategory || "Low";
    /*
        Map priority to a visual color.
        These colors match the SmartRoad theme:
        - Critical → pink
        - High → yellow
        - Medium → orange
        - Low → green
    */
    const markerColor =
        getMarkerColor(category);
    /*
        Leaflet circleMarker is used instead of a standard
        image icon so we don't need additional marker assets.
    */
    const marker =
        L.circleMarker(
            [
                report.latitude,
                report.longitude
            ],
            {
                radius: 10,
                fillColor: markerColor,
                color: "#050505",
                weight: 3,
                opacity: 1,
                fillOpacity: 0.9
            }
        );
    /*
        Popup content shown when the marker is clicked.
    */
    marker.bindPopup(`
        <div class="map-popup">
            <div class="popup-priority">
                ${escapeHTML(category)}
            </div>
            <h3>
                ${escapeHTML(report.problemType)}
            </h3>
            <p>
                <strong>LOCATION</strong><br>
                ${escapeHTML(report.area)},
                ${escapeHTML(report.city)}
            </p>
            <p>
                <strong>SEVERITY</strong><br>
                ${escapeHTML(report.severity)}
            </p>
            <p>
                <strong>STATUS</strong><br>
                ${escapeHTML(report.status)}
            </p>
            <p>
                ${escapeHTML(report.description)}
            </p>
        </div>
    `);
    /*
        Add marker to the marker layer.
    */
    marker.addTo(reportMarkerLayer);
    mappedReports++;
});
/*
    Update the map report count.
    We count only reports that have usable coordinates.
*/
const mapCount =
    document.getElementById("map-report-count");
if (mapCount) {
    mapCount.textContent =
        mappedReports;
}

}

/*
Return the marker color for each priority category.
*/
function getMarkerColor(category) {

switch (category) {
    case "Critical":
        return "#ff5a1f";
    case "High":
        return "#f5c518";
    case "Medium":
        return "#c9922a";
    case "Low":
    default:
        return "#2f9e5b";
}

}

/*
Make the refresh function available globally.

This allows clearAllReports() to refresh the map.

*/
window.refreshSmartRoadMap =
refreshSmartRoadMap;

/* Keep an already-open map in another browser tab in sync with updates. */
window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) {
        return;
    }
    updateStatistics();
    renderIssueCards();
    refreshSmartRoadMap();
});

/* ================================================================
17. PAGE INITIALIZATION
================================================================ */

/*
DOMContentLoaded runs after the HTML structure has loaded.

We initialize only the functionality relevant to the current
page.

*/
document.addEventListener(
"DOMContentLoaded",
function () {

    /*
        Mobile navigation menu exists on every page.
    */
    initializeMobileNav();
    /*
        Visual effects: scroll progress, reveal-on-scroll,
        3D tilt and hero parallax. All are safe no-ops on
        pages/elements where the relevant markup is absent.
    */
    initializeScrollProgress();
    initializeScrollReveal();
    initializeTiltEffect();
    initializeHeroParallax();
    /* Complete a hand-off that expired while this page was closed. */
    resolveExpiredReports();
    /*
        Update statistics on every page.
    */
    updateStatistics();
    /*
        Report form only exists on report.html.
    */
    initializeReportForm();
    /*
        Issue dashboard only exists on issues.html.
    */
    initializeIssuesPage();
    /*
        Map only exists on index.html.
    */
    initializeMap();
    /*
        Live traffic hotspot dashboard only exists on index.html.
    */
    initializeLiveTrafficDashboard();
}

);