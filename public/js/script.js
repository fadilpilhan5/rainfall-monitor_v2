document.addEventListener('DOMContentLoaded', () => {
    const totalRainfallElement = document.getElementById('totalRainfall');
    const historicalCtx = document.getElementById('historicalRainfallChart').getContext('2d'); // Canvas untuk historical rainfall

    let rainfallTotal = 0;  // Total rainfall today
    let chartInstance; // Simpan instance chart
    let dailyRainfall = {}; // Objek untuk menyimpan data historis

    // MQTT configuration
    const mqttBroker = 'wss://broker.emqx.io:8084/mqtt';  
    const mqttClientId = 'web_client_' + Math.random().toString(16).substr(2, 8);
    const mqttTopicRainfall = 'curah_hujan/tip'; // Topic for rainfall tips

    // Connecting to the MQTT broker
    const client = mqtt.connect(mqttBroker, { clientId: mqttClientId });

    client.on('connect', () => {
        console.log('Connected to MQTT broker');
        client.subscribe(mqttTopicRainfall, (err) => {
            if (!err) {
                console.log("Subscribed to topic: " + mqttTopicRainfall);
            }
        });
    });

    // Handling incoming messages
    client.on('message', async (topic, message) => {
        const tipValue = parseFloat(message.toString());
        rainfallTotal += tipValue;

        const today = new Date().toLocaleDateString();

        // Update dailyRainfall
        if (!dailyRainfall[today]) {
            dailyRainfall[today] = 0;
        }
        dailyRainfall[today] += tipValue;

        // Update total rainfall display
        totalRainfallElement.textContent = rainfallTotal.toFixed(2);

        // Update the chart with the new data
        updateChart(Object.keys(dailyRainfall), Object.values(dailyRainfall));

        // Simpan ke MongoDB
        await saveRainfallToDB(tipValue);
    });

    // Function to update the chart
    function updateChart(labels, values) {
        if (chartInstance) {
            chartInstance.data.labels = labels;
            chartInstance.data.datasets[0].data = values;
            chartInstance.update();
        } else {
            // Create chart if it doesn't exist
            chartInstance = new Chart(historicalCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Rainfall (mm)',
                        data: values,
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }

    async function fetchTotalRainfallToday() {
        try {
            const response = await fetch('/api/rainfall/today');
            const data = await response.json();
            rainfallTotal = data.totalRainfall; // Set total rainfall dari database
            totalRainfallElement.textContent = rainfallTotal.toFixed(2);
        } catch (error) {
            console.error('Error fetching total rainfall today:', error);
        }
    }

    async function saveRainfallToDB(value) {
        // Simpan data ke MongoDB jika perlu
        try {
            await fetch('/api/rainfall', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ value: value })
            });
        } catch (error) {
            console.error('Error saving rainfall data:', error);
        }
    }

    // Function to fetch historical data based on selected time range
    async function fetchHistoricalData(timeRange = 'daily') {
        try {
            const response = await fetch(`/api/historical-rainfall?range=${timeRange}`);
            if (!response.ok) {
                const errorData = await response.json(); // Get error response
                console.error('Error fetching historical data:', errorData.error);
                return; // Stop execution if error
            }
            const data = await response.json();
            console.log('Data fetched from API:', data);
    
            // Proses data sesuai dengan rentang waktu yang diterima
            const historicalLabels = data.map(item => item._id); // Ambil label dari data
            const historicalValues = data.map(item => item.totalRainfall); // Ambil total rainfall dari data
    
            // Update chart
            updateChart(historicalLabels, historicalValues);
        } catch (error) {
            console.error('Error fetching historical data:', error);
        }
    }
    
    // Call the fetch function when the document is loaded
    fetchTotalRainfallToday();
    fetchHistoricalData(); // Call with default 'daily' range

    document.getElementById('timeRange').addEventListener('change', (event) => {
        const selectedRange = event.target.value; // Ambil rentang waktu yang dipilih
        if (selectedRange) {
            fetchHistoricalData(selectedRange); // Panggil fungsi untuk mengambil data sesuai rentang waktu
        }
    });

    // Refresh button event listener
    document.getElementById('refreshData').addEventListener('click', () => {
        fetchTotalRainfallToday();
        fetchHistoricalData(); // Call with current selected range
    });
});
