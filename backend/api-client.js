/* SmartRoad backend bridge. Local storage remains a graceful offline fallback. */
(function () {
    const baseUrl = window.SMARTROAD_API_URL || "http://127.0.0.1:8000/api";
    let saveTimer;

    async function request(path, options) {
        const response = await fetch(baseUrl + path, {
            headers: { "Content-Type": "application/json" },
            ...options
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || "Server request failed.");
        }
        return response.json();
    }

    window.SmartRoadAPI = {
        async loadReports() {
            const data = await request("/reports");
            return data.reports;
        },
        queueSave(reports) {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                request("/reports", { method: "PUT", body: JSON.stringify({ reports }) })
                    .catch(error => console.warn("SmartRoad backend unavailable; using local storage.", error));
            }, 200);
        }
    };
}());
