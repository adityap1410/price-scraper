/*const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const cron = require('node-cron');

// URL of the Amazon search results page for iPhones
const url = 'https://www.amazon.in/s?k=iphone';
const outputFilePath = 'prices.csv';

// Function to scrape prices and names
const scrapePricesAndNames = async () => {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });

    const results = await page.evaluate(() => {
        const items = document.querySelectorAll('div.s-main-slot > div.s-result-item');
        const data = [];

        items.forEach(item => {
            const nameElement = item.querySelector('span.a-size-medium.a-color-base.a-text-normal');
            const name = nameElement ? nameElement.innerText : null;

            const priceWholeElement = item.querySelector('span.a-price-whole');
            const priceSymbolElement = item.querySelector('span.a-price-symbol');

            let price = priceWholeElement ? priceWholeElement.innerText : '';
            if (priceSymbolElement) {
                price = priceSymbolElement.innerText + price;
            }

            if (name && price) {
                data.push({ name, price });
            }
        });

        return data;
    });

    await browser.close();

    // Write results to CSV
    const csvWriter = createCsvWriter({
        path: outputFilePath,
        header: [
            { id: 'name', title: 'Name' },
            { id: 'price', title: 'Price' }
        ],
        append: false // Overwrite the file instead of appending
    });

    await csvWriter.writeRecords(results);
    console.log('Results saved to CSV:', outputFilePath);
};

// Schedule the scraping to run every 2 minutes
cron.schedule('* * * * *', () => {
    console.log('Running the scheduled task...');
    scrapePricesAndNames();
});*/

const express = require('express');
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const cron = require('node-cron');
const fs = require('fs');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname))); // Serve static files from the same directory

const port = 3000;
let currentQuery = null;
let isTracking = false;
let cronJob = null;

// Function to scrape prices and names
const scrapePricesAndNames = async (query) => {
    try {
        const url = `https://www.amazon.in/s?k=${query}`;
        const timestamp = new Date().toISOString();
        const outputFilePath = path.join(__dirname, 'prices.csv');

        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2' });

        const results = await page.evaluate(() => {
            const items = document.querySelectorAll('div.s-main-slot > div.s-result-item');
            const data = [];

            items.forEach(item => {
                const nameElement = item.querySelector('span.a-size-medium.a-color-base.a-text-normal');
                const name = nameElement ? nameElement.innerText : null;

                const priceWholeElement = item.querySelector('span.a-price-whole');
                const priceSymbolElement = item.querySelector('span.a-price-symbol');

                let price = priceWholeElement ? priceWholeElement.innerText : '';
                if (priceSymbolElement) {
                    price = priceSymbolElement.innerText + price;
                }

                if (name && price) {
                    data.push({ name, price });
                }
            });

            return data;
        });

        await browser.close();

        // Append results to CSV
        const csvWriter = createCsvWriter({
            path: outputFilePath,
            header: [
                { id: 'timestamp', title: 'Timestamp' },
                { id: 'name', title: 'Name' },
                { id: 'price', title: 'Price' }
            ],
            append: true // Append to the file instead of overwriting
        });

        const dataWithTimestamp = results.map(item => ({
            timestamp,
            name: item.name,
            price: item.price
        }));

        await csvWriter.writeRecords(dataWithTimestamp);
        console.log('Results saved to CSV:', outputFilePath);
    } catch (error) {
        console.error('Error during scraping:', error);
        throw error;
    }
};

// Endpoint to trigger price check and download CSV
app.post('/check-price', async (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        await scrapePricesAndNames(query);
        res.download(path.join(__dirname, 'prices.csv'), 'prices.csv');
    } catch (error) {
        console.error('Error in /check-price endpoint:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Endpoint to start price tracking
app.post('/start-price-tracker', (req, res) => {
    try {
        const { query } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }
        currentQuery = query;
        isTracking = true;
        console.log('Started price tracking for:', query);

        // Schedule the scraping to run every 2 minutes
        if (cronJob) {
            cronJob.stop();
        }
        cronJob = cron.schedule('*/1 * * * *', async () => {
            if (isTracking && currentQuery) {
                console.log('Running scheduled task...');
                await scrapePricesAndNames(currentQuery);
            }
        });

        res.json({ message: 'Price tracking started.' });
    } catch (error) {
        console.error('Error in /start-price-tracker endpoint:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Endpoint to stop price tracking
app.post('/stop-price-tracker', (req, res) => {
    try {
        isTracking = false;
        if (cronJob) {
            cronJob.stop();
        }
        console.log('Stopped price tracking.');
        res.json({ message: 'Price tracking stopped.' });
    } catch (error) {
        console.error('Error in /stop-price-tracker endpoint:', error);
        res.status(500).json({ error: 'An error occurred' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
