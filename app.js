const app = {
    location: null,
    weatherData: null,
    units: 'imperial', // 'metric' or 'imperial'

    init: () => {
        const toggle = document.getElementById('unit-switch');
        toggle.addEventListener('change', (e) => {
            app.units = e.target.checked ? 'imperial' : 'metric';
            document.getElementById('unit-label').textContent = app.units === 'metric' ? '°C' : '°F';
            app.updateUI();
        });

        app.getLocation();
    },

    getLocation: () => {
        const status = document.getElementById('location-status');
        if (!navigator.geolocation) {
            status.textContent = "Geolocation is not supported by your browser";
            return;
        }

        status.textContent = "Locating...";
        navigator.geolocation.getCurrentPosition(
            (position) => {
                app.location = position.coords;
                status.textContent = "Location found";
                app.getWeather(app.location.latitude, app.location.longitude);
            },
            () => {
                status.textContent = "Unable to retrieve your location";
            }
        );
    },

    getWeather: async (lat, lon) => {
        const status = document.getElementById('weather-display');
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,weathercode,is_day&daily=sunrise,sunset&timezone=auto&forecast_days=2`;

        try {
            const response = await fetch(url);
            const data = await response.json();
            app.weatherData = data;
            app.updateUI();
        } catch (error) {
            console.error(error);
            if (status) status.textContent = "Error fetching weather data.";
        }
    },

    updateUI: () => {
        if (!app.weatherData) return;
        app.renderCurrentWeather();
        app.renderSunSchedule();
        app.renderChart();
        app.renderWalkingWindows();
    },

    toFahrenheit: (c) => Math.round((c * 9 / 5) + 32),
    formatTemp: (c) => {
        if (app.units === 'imperial') {
            return `${app.toFahrenheit(c)}°F`;
        }
        return `${Math.round(c)}°C`;
    },

    getWeatherIcon: (code, isDay = 1) => {
        // WMO Weather interpretation codes (WW)
        // 0: Clear sky
        // 1, 2, 3: Mainly clear, partly cloudy, and overcast
        // 45, 48: Fog
        // 51-55: Drizzle
        // 61-65: Rain
        // 71-77: Snow
        // 80-82: Rain showers
        // 95-99: Thunderstorm

        switch (true) {
            case (code === 0): return isDay ? '☀️' : '🌙';
            case (code >= 1 && code <= 3): return isDay ? '⛅' : '☁️';
            case (code >= 45 && code <= 48): return '🌫️';
            case (code >= 51 && code <= 67): return '🌧️';
            case (code >= 71 && code <= 77): return '❄️';
            case (code >= 80 && code <= 82): return '🌦️';
            case (code >= 95 && code <= 99): return '⚡';
            default: return '🌈'; // Fallback
        }
    },

    renderCurrentWeather: () => {
        const display = document.getElementById('weather-display');
        const currentHour = new Date().getHours();

        const temp = app.weatherData.hourly.temperature_2m[currentHour];
        const precip = app.weatherData.hourly.precipitation_probability[currentHour];
        const code = app.weatherData.hourly.weathercode[currentHour];
        const isDay = app.weatherData.hourly.is_day[currentHour];

        const icon = app.getWeatherIcon(code, isDay);

        display.innerHTML = `
            <div class="weather-icon">${icon}</div>
            <div class="weather-details">
                <div style="font-size: 2rem; font-weight: bold;">${app.formatTemp(temp)}</div>
                <div style="color:var(--text-secondary)">Precip: ${precip}%</div>
            </div>
        `;
    },

    renderSunSchedule: () => {
        try {
            const sunrise = new Date(app.weatherData.daily.sunrise[0]);
            const sunset = new Date(app.weatherData.daily.sunset[0]);
            const formatTime = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            document.getElementById('sunrise-time').textContent = formatTime(sunrise);
            document.getElementById('sunset-time').textContent = formatTime(sunset);
        } catch (e) {
            console.log("Sun data rendering error", e);
        }
    },

    renderChart: () => {
        const ctx = document.getElementById('precipChart').getContext('2d');
        if (window.myChart) window.myChart.destroy();

        const hours = app.weatherData.hourly.time.slice(0, 24).map(t => new Date(t).getHours() + ":00");
        const precipData = app.weatherData.hourly.precipitation_probability.slice(0, 24);

        window.myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Precipitation Chance (%)',
                    data: precipData,
                    backgroundColor: 'rgba(3, 218, 198, 0.5)',
                    borderColor: 'rgba(3, 218, 198, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '#333' }
                    },
                    x: {
                        grid: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            },
            plugins: [{
                id: 'nowLine',
                afterDatasetsDraw: (chart) => {
                    const ctx = chart.ctx;
                    const nowHour = new Date().getHours();
                    const label = nowHour + ":00";

                    const x = chart.scales.x.getPixelForValue(label);

                    if (x) {
                        ctx.save();
                        ctx.beginPath();
                        ctx.moveTo(x, chart.scales.y.top);
                        ctx.lineTo(x, chart.scales.y.bottom);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#cf6679';
                        ctx.setLineDash([5, 5]);
                        ctx.stroke();

                        ctx.fillStyle = '#cf6679';
                        ctx.textAlign = 'center';
                        ctx.font = 'bold 12px Inter';
                        ctx.fillText('Now', x, chart.scales.y.top - 5);

                        ctx.restore();
                    }
                }
            }]
        });
    },

    calculateScore: (item) => {
        const precipPenalty = item.precip * 2;
        const tempF = app.toFahrenheit(item.tempC);
        const tempPenalty = Math.abs(tempF - 60);
        const darknessPenalty = (item.isDay === 0) ? 10 : 0;
        return precipPenalty + tempPenalty + darknessPenalty;
    },

    renderWalkingWindows: () => {
        const listFull = document.getElementById('windows-list');
        const listTop = document.getElementById('top-list');
        listFull.innerHTML = '';
        listTop.innerHTML = '';

        const times = app.weatherData.hourly.time;
        const precips = app.weatherData.hourly.precipitation_probability;
        const temps = app.weatherData.hourly.temperature_2m;
        const isDays = app.weatherData.hourly.is_day;

        const nowIndex = new Date().getHours();
        const windows = [];

        for (let i = 0; i < 24; i++) {
            const dataIndex = nowIndex + i;
            if (dataIndex >= times.length) break;

            const timeStr = times[dataIndex];
            const dateObj = new Date(timeStr);
            const hour = dateObj.getHours();

            if (hour >= 21 || hour < 5) continue;

            const p = precips[dataIndex];
            const t = temps[dataIndex];
            const d = isDays[dataIndex];

            const windowObj = {
                dateObj: dateObj,
                precip: p,
                tempC: t,
                isDay: d,
                originalIndex: i
            };

            windowObj.score = app.calculateScore(windowObj);
            windowObj.displayTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const todayDay = new Date().getDate();
            const currentDay = dateObj.getDate();
            windowObj.dayLabel = (currentDay !== todayDay) ? `<small style="color:#888; margin-left:5px;">(Tom.)</small>` : '';

            windows.push(windowObj);
        }

        const sortedWindows = [...windows].sort((a, b) => a.score - b.score);
        const top3 = [];

        for (const candidate of sortedWindows) {
            if (top3.length >= 3) break;
            const isTooClose = top3.some(picked => {
                const diffMs = Math.abs(candidate.dateObj - picked.dateObj);
                const diffHours = diffMs / (1000 * 60 * 60);
                return diffHours < 5;
            });

            if (!isTooClose) {
                top3.push(candidate);
            }
        }

        top3.sort((a, b) => a.dateObj - b.dateObj);

        const createListItem = (item, isTop = false) => {
            const li = document.createElement('li');
            li.className = 'window-item';
            if (item.isDay === 0) li.classList.add('night-shaded');

            let statusText = '';
            let statusClass = '';

            if (item.precip < 20) {
                statusText = "Great";
                statusClass = "good-condition";
            } else if (item.precip < 50) {
                statusText = "Chance of rain";
                statusClass = "window-condition";
            } else {
                statusText = "Rainy";
                statusClass = "bad-condition";
            }

            const tempDisplay = app.formatTemp(item.tempC);
            const icon = isTop ? '🏆 ' : '';

            li.innerHTML = `
                <span class="window-time">${icon}${item.displayTime}${item.dayLabel}</span>
                <div style="text-align:right">
                    <span class="${statusClass}">${statusText} (${item.precip}%)</span>
                    <br>
                    <small style="color:#aaa">${tempDisplay}</small>
                </div>
            `;
            return li;
        };

        if (top3.length === 0) {
            listTop.innerHTML = '<li style="padding:20px; color:#888;">No good windows found.</li>';
        } else {
            top3.forEach(w => listTop.appendChild(createListItem(w, true)));
        }

        if (windows.length === 0) {
            listFull.innerHTML = '<li style="padding:20px; color:#888;">No windows in next 24h.</li>';
        } else {
            windows.forEach(w => listFull.appendChild(createListItem(w)));
        }
    }
};

document.addEventListener('DOMContentLoaded', app.init);
