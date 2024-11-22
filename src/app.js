const express = require('express');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const cors = require('cors'); // Tambahkan ini
const app = express();
const port = 3000;
const path = require('path') 
const hbs = require('hbs') 
// Koneksi MongoDB
mongoose.connect('mongodb://localhost:27017/rainfallDB')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// Skema Mongoose
const rainfallSchema = new mongoose.Schema({
    value: Number,
    timestamp: { type: Date, default: Date.now }
});

const Rainfall = mongoose.model('Rainfall', rainfallSchema);

// Koneksi ke broker MQTT
const mqttClient = mqtt.connect('mqtt://broker.emqx.io');
mqttClient.on('connect', function () {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe('curah_hujan/tip');
});

// Simpan data ke MongoDB saat pesan diterima
mqttClient.on('message', async function (topic, message) {
    console.log('Received rain tip:', message.toString());
    
    const rainfall = new Rainfall({
        value: parseFloat(message.toString())
    });

    try {
        await rainfall.save();
        console.log('Data saved to MongoDB:', rainfall.value);
    } catch (error) {
        console.error('Error saving data to MongoDB:', error);
    }
});

// Gunakan middleware CORS
app.use(cors());

// Middleware untuk meng-parsing body request
app.use(express.json()); // Pastikan ini ditambahkan agar Express dapat membaca JSON body

// API untuk total curah hujan hari ini
app.get('/api/rainfall/today', async (req, res) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);  // Set jam ke awal hari

    try {
        const totalRainfall = await Rainfall.aggregate([
            { $match: { timestamp: { $gte: today } } },
            { $group: { _id: null, totalRainfall: { $sum: "$value" } } }
        ]);

        res.json(totalRainfall[0] || { totalRainfall: 0 });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// API endpoint untuk mendapatkan data curah hujan akumulasi per hari
app.get('/api/historical-rainfall', async (req, res) => {
    const timeRange = req.query.range; // Ambil parameter rentang waktu dari query

    // Pastikan parameter rentang waktu valid
    if (!timeRange || !['daily', 'weekly', 'monthly', 'yearly'].includes(timeRange)) {
        return res.status(400).json({ error: 'Invalid time range' });
    }

    // Logika untuk menyaring data berdasarkan rentang waktu
    let matchStage = {};
    const today = new Date();

    // Menentukan rentang waktu berdasarkan pilihan
    if (timeRange === 'weekly') {
        const lastWeek = new Date();
        lastWeek.setDate(today.getDate() - 7);
        matchStage = { timestamp: { $gte: lastWeek } };
    } else if (timeRange === 'monthly') {
        const lastMonth = new Date();
        lastMonth.setMonth(today.getMonth() - 1);
        matchStage = { timestamp: { $gte: lastMonth } };
    } else if (timeRange === 'yearly') {
        const lastYear = new Date();
        lastYear.setFullYear(today.getFullYear() - 1);
        matchStage = { timestamp: { $gte: lastYear } };
    }

    try {
        const data = await Rainfall.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: { $dateToString: { format: timeRange === 'yearly' ? "%Y" : "%Y-%m-%d", date: "$timestamp" } },
                    totalRainfall: { $sum: "$value" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);
        res.json(data);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// API endpoint untuk menyimpan curah hujan
app.post('/api/rainfall', async (req, res) => {
    try {
        const { value } = req.body; // Mengambil nilai dari body request
        const rainfall = new Rainfall({ value });
        await rainfall.save();
        res.status(201).send(rainfall); // Kirim respons sukses dengan data yang disimpan
    } catch (error) {
        console.error('Error saving rainfall data:', error);
        res.status(500).send(error.message); // Kirim error jika terjadi
    }
});

// Menyajikan file statis
app.use(express.static(path.join(__dirname, '../public')));
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');

app.get('/',(req,res)=>{
    res.render('Home');
})
// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

