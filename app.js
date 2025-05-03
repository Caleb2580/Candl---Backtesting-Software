const express = require('express');
const app = express();
const PORT = 4600;
const path = require('path');

const dotenv = require('dotenv');
dotenv.config();

const mysql = require('mysql2');
const bcrypt = require('bcrypt');

app.use(express.json());

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: process.env.MYSQL_PASSWORD,
    database: 'TRADE',
    connectionLimit: 10, // Optional: set the maximum number of connections,
    multipleStatements: true,
    dateStrings: ['DATETIME', 'DATE', 'TIME']
}).promise();

app.use('/styles', express.static(path.join(__dirname, 'public', 'styles')));
app.use('/scripts', express.static(path.join(__dirname, 'public', 'scripts')));
app.use('/lightweight-charts', express.static(path.join(__dirname, 'node_modules', 'lightweight-charts')));



const tickers = [
    "AAPL", "MSFT", "AMZN", "GOOGL", "TSLA", "FB", "NVDA", "JPM", "V", "JNJ", "PG", "UNH", "MA", "INTC", "HD",
    "BAC", "DIS", "CMCSA", "VZ", "ADBE", "NFLX", "PYPL", "T", "CRM", "PEP", "CSCO", "ABBV", "KO", "XOM", "MRK", "WMT",
    "ABT", "PFE", "CVX", "NKE", "TMO", "ACN", "COST", "DHR", "NEE", "MDT", "AVGO", "UNP", "TXN", "QCOM", "HON",
    "LIN", "PM", "LLY", "UPS", "SBUX", "LOW", "BA", "ORCL", "AMD", "IBM", "NOW", "GS", "INTU", "CHTR", "AMAT", "CAT",
    "FIS", "MMM", "BDX", "GILD", "CVS", "MO", "SPGI", "ANTM", "ISRG", "ADP", "CME", "MMC", "VRTX", "ZTS", "CSX", "RTX",
    "TGT", "LMT", "SCHW", "BIIB", "CI", "SYK", "PNC", "AXP", "APD", "FDX", "BKNG", "TMUS", "COP", "DUK", "DOW", "ECL",
    "SO", "ADI", "AGN", "BDX", "D", "EMR", "EW", "EXC", "HUM", "ICE", "KLAC", "MCD", "MCK", "MET", "MS", "NEE", "NSC",
    "PLD", "PSX", "SPG", "TJX", "WBA", "WFC", "AIG", "ALL", "APTV", "BIIB", "BSX", "COF", "DAL", "DE", "DXCM", "EQR",
    "ETN", "GD", "ITW", "JCI", "KR", "MAR", "MU", "NEM", "ORLY", "PKG", "RMD", "SWK", "UAL", "VRTX",
    "WELL", "YUM", "BIO", "BSX", "CTSH", "DRI", "EBAY", "FISV", "FLT", "GPN", "IDXX", "ILMN", "IQV",
    "KHC", "MNST", "MSCI", "NTAP", "NUE", "PAYX", "REGN", "ROST", "STZ", "TT", "VRSK", "WST", "ALGN", "ANSS",
    "APH", "CERN", "EXPE", "FTNT", "KEYS", "LEN", "NTRS", "ODFL", "OKTA", "POOL", "SNPS",
    "TFX", "TTWO", "UAL", "ULTA", "URI", "VRSN", "ZBRA", "AAP", "DLTR", "ETSY", "FOXA",
    "HCA", "HOLX", "IDXX", "INCY", "IR", "JKHY", "MKTX", "MNST", "MTCH", "NTES", "NTNX", "NWSA",
    "PEAK", "PENN", "PTON", "ROKU", "SEDG", "SPLK", "TTD", "TWTR", "UAA", "VRSK", "WYNN",
];


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/trade', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trade.html'));
});

app.post('/api/get-ticker', async(req, res) => {
    try {
        let randomTicker;
        let randomDay;
        let count;
        let targetDate;

        const {username, password} = req.body;
        const valid = await checkPassword(username, password);
        if (!valid) {
            return res.send({'success': false, 'error': 'Invalid username or password'});
        }

        const [result] = await pool.query('SELECT id FROM users WHERE username = ?;', [username]);
        if (result.length == 0) {
            return res.send({'success': false, 'error': 'User not found'});
        }
        
        const user_id = result[0].id;
        

        do {
            randomTicker = tickers[Math.floor(Math.random() * tickers.length)];
            const today = new Date();

            // Generate a random day that is a weekday
            do {
                targetDate = new Date(today);
                randomDay = Math.floor(Math.random() * 21) + 1; // Random day between 1 and 21
                targetDate.setDate(today.getDate() - randomDay); // Subtract random days from today
            } while (targetDate.getDay() === 0 || targetDate.getDay() === 1); // 0 = Sunday, 6 = Saturday

            const query = `SELECT COUNT(*) as count FROM last_ticker_days WHERE ticker = ? AND day = ? AND month = ? AND year = ? AND user_id = ?`;
            const [result] = await pool.query(query, [randomTicker, targetDate.getDate(), targetDate.getMonth() + 1, targetDate.getFullYear(), user_id]);
            count = result[0].count;
        } while (count > 0); // Repeat until a ticker and date with no existing record is found
        await pool.query('CALL insert_last_ticker_days(?, ?, ?, ?, ?);', [randomTicker, targetDate.getDate(), targetDate.getMonth() + 1, targetDate.getFullYear(), user_id]);
        return res.send({'success': true, 'ticker': randomTicker, 'date': targetDate.toISOString().split('T')[0]});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'error': 'Something went wrong'});
    }
})

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

async function createUser(username, password, resets) {
    try {
        const query = `INSERT INTO users (username, password, resets) VALUES (?, ?, ?);`;
        const [result] = await pool.query(query, [username, password, resets]);
        return result.insertId;
    } catch (error) {
        console.log(error);
        return null;
    }
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
}

function generatePassword(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return password;
}

async function setup() {
    let usernames = ['Caleb', 'Judah'];
    for (let username of usernames) {
        let password = generatePassword();
        createUser(username, await hashPassword(password), 0).then(async(result) => {
            if (result != null) {
                console.log(`User ${username}  :  ${password} created successfully`);
                await pool.query('INSERT INTO checkpoints (user_id, balance, buy_sell) VALUES (?, ?, ?);', [result, 1000, 1]);
            } else {
                console.log(`User ${username} already exists`);
            }
        }).catch((error) => {
            console.log(error);
        });
    }

}

// setup();

app.post('/api/create-account', async(req, res) => {
    try {
        let { username, password } = req.body;

        let r = (await pool.query('SELECT id, resets, password FROM users WHERE username = ?;', [username]))[0];
        if (r.length > 0) {
            let ind = 1;
            while (1) {
                let users = (await pool.query('SELECT id FROM users WHERE username = ?;', [username + ' ' + ind]))[0];
                if (users.length == 0) {
                    let [result] = await pool.query('UPDATE users SET username = ?, hidden=1 WHERE id = ?;', [username + ' ' + ind, r[0].id]);
                    break;
                }
                ind++;
            }
        }

        password = await hashPassword(password);

        let resets = r.length > 0 ? r[0].resets+1 : 0;
        const result = await createUser(username, password, resets);
        if (result == null) {
            return res.send({'success': false, 'message': 'Username already exists'});
        }
        await pool.query('INSERT INTO checkpoints (user_id, balance, buy_sell, buy_or_sell) VALUES (?, ?, ?, ?);', [result, 1000, 1, 1]);
        return res.send({'success': true});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'message': 'Something went wrong'});
    }
});

app.post('/api/login', async(req, res) => {
    try {
        const { username, password } = req.body;
        const valid = await checkPassword(username, password);
        if (!valid) {
            return res.send({'success': false, 'message': 'Invalid username or password'});
        }
        return res.send({'success': true});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'message': 'Invalid username or password'});
    }
});

async function checkPassword(username, password) {
    const query = `SELECT * FROM users WHERE username = ?;`;
    const [result] = await pool.query(query, [username]);
    if (result.length == 0) {
        return false;
    }
    const hashedPassword = result[0].password;
    return await bcrypt.compare(password, hashedPassword);
}

app.post('/api/balance', async(req, res) => {
    try {
        const { username, password } = req.body;
        const valid = await checkPassword(username, password);
        if (!valid) {
            return res.send({'success': false, 'message': 'Invalid username or password'});
        }
        const query = `SELECT balance FROM users WHERE username = ?;`;
        const [result] = await pool.query(query, [username]);
        return res.send({'success': true, 'balance': parseFloat(result[0].balance)});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'message': 'Something went wrong'});
    }
});

app.put('/api/set-balance', async(req, res) => {
    try {
        const { username, password, balance, buy_sell, buy_or_sell } = req.body;
        const valid = await checkPassword(username, password);
        if (!valid) {
            return res.send({'success': false, 'message': 'Invalid username or password'});
        }
        const query = `UPDATE users SET balance = ? WHERE username = ?;`;

        let [result] = await pool.query(query, [balance, username]);

        [result] = await pool.query('SELECT id, balance FROM users WHERE username = ?;', [username]);
        if (buy_sell == 1) {
            await pool.query('INSERT INTO checkpoints (user_id, balance, buy_sell, buy_or_sell) VALUES (?, ?, ?, ?);', [result[0].id, result[0].balance, buy_sell, buy_or_sell]);
        }

        return res.send({'success': true, 'balance': result[0].balance});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'message': 'Something went wrong'});
    }
});

app.put('/api/balance', async(req, res) => {
    try {
        const { username, password, change, buy_sell } = req.body;
        const valid = await checkPassword(username, password);
        if (!valid) {
            return res.send({'success': false, 'message': 'Invalid username or password'});
        }
        const query = `UPDATE users SET balance = balance + ? WHERE username = ?;`;
        let [result] = await pool.query(query, [change, username]);

        [result] = await pool.query('SELECT id, balance FROM users WHERE username = ?;', [username]);
        if (buy_sell == 1) {
            await pool.query('INSERT INTO checkpoints (user_id, balance, buy_sell) VALUES (?, ?, ?);', [result[0].id, result[0].balance, buy_sell]);
        }

        return res.send({'success': true, balance: result[0].balance});
    } catch (error) {
        console.log(error);
        return res.send({'success': false, 'message': 'Something went wrong'});
    }
});


app.get('/api/leaderboard', async (req, res) => {
    try {
        const query = `SELECT id, username, balance, resets FROM users WHERE hidden=0;`;
        const [users] = await pool.query(query);

        const checkpointsQuery = `SELECT user_id, balance, buy_sell, buy_or_sell, created_at FROM checkpoints WHERE buy_sell = 1 ORDER BY id ASC;`;
        const [checkpoints] = await pool.query(checkpointsQuery);

        // Get query parameters for filtering
        const { showBuySell, selectedUser } = req.query;

        // Structure the data for the frontend
        const leaderboard = users.map(user => {
            const userCheckpoints = checkpoints.filter(cp => cp.user_id === user.id);
            // Filter checkpoints based on query parameters
            if (showBuySell === 'true') {
                return {
                    username: user.username,
                    balance: user.balance,
                    checkpoints: userCheckpoints.filter(cp => cp.buy_sell === 1) // Only buy/sell checkpoints
                };
            }
            return {
                username: user.username,
                balance: user.balance,
                checkpoints: userCheckpoints
            };
        });

        // If a specific user is selected, filter the leaderboard
        if (selectedUser) {
            return res.send({
                success: true,
                leaderboard: leaderboard.filter(user => user.username === selectedUser)
            });
        }

        return res.send({ success: true, leaderboard });
    } catch (error) {
        console.log(error);
        return res.send({ success: false, message: 'Something went wrong' });
    }
});


app.get('/api/candles', async (req, res) => {
    try {
        let { ticker, interval, endDate, daysBack } = req.query;

        // endDate = new Date(endDate);

        // Basic validation
        if (!ticker || !interval || !endDate) {
            return res.status(400).json({ error: 'Missing required query parameters: ticker and interval' });
        }

        const endDateObj = new Date(endDate); // Convert endDate from ISO string to Date object
        const startDate = new Date(endDateObj);
        startDate.setDate(endDateObj.getDate() - daysBack);
        const data = await grabData(ticker, interval, startDate, endDate);

        if (data == null) {
            return res.send({'success': false, 'error': 'No data found, please select a new ticker'})
        }

        if (data && data.length > 0) {
            data.pop(); // Remove the last index if data is not null and has elements
        }

        res.send({'success': true, 'data': data})
    } catch (error) {
        return res.send({'success': false, 'error': 'Error fetching data, please try again'})
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});












// Functions
async function fetchDirectYahooData(ticker, interval, startDate, endDate, includePrePost = false, events = 'div,splits') {
    const _BASE_URL_ = 'https://query2.finance.yahoo.com';
    // console.warn("Attempting direct call to Yahoo Finance API. This is likely to fail due to browser CORS restrictions. Using the backend /api/candles endpoint is recommended.");

    let startTimestamp, endTimestamp;
    try {
        // Convert dates to Unix timestamps (seconds)
        endTimestamp = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
        startTimestamp = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : null;

        if (isNaN(endTimestamp)) throw new Error("Invalid end date format");
        if (startDate && isNaN(startTimestamp)) throw new Error("Invalid start date format");

        // If no start date, calculate a default range based roughly on yfinance logic (lacks proper TZ handling)
        if (!startTimestamp) {
            const intervalLower = interval.toLowerCase();
            let daysToSubtract;
            if (intervalLower === "1m") {
                daysToSubtract = 7;
            } else if (["2m", "5m", "15m", "30m", "90m"].includes(intervalLower)) {
                daysToSubtract = 60;
            } else if (["1h", "60m"].includes(intervalLower)) {
                daysToSubtract = 730;
            } else { // 1d, 5d, 1wk, 1mo, 3mo etc.
                daysToSubtract = 365 * 5; // Default to 5 years for daily/weekly/monthly
            }
            startTimestamp = endTimestamp - (daysToSubtract * 24 * 60 * 60);
            console.log(`Defaulting start timestamp to approx ${daysToSubtract} days before end timestamp ${endTimestamp}. Proper timezone handling is complex in frontend JS.`);
        }

        if (startTimestamp >= endTimestamp) {
            throw new Error("Start date must be before end date.");
        }

    } catch (e) {
        console.error("Error processing dates:", e);
        throw new Error(`Invalid date format or range: ${e.message}. Use YYYY-MM-DD or Date object.`);
    }

    const params = {
        period1: startTimestamp,
        period2: endTimestamp,
        interval: interval.toLowerCase(),
        includePrePost: includePrePost,
        events: events
    };

    const queryString = Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');

    const url = `${_BASE_URL_}/v8/finance/chart/${ticker}?${queryString}`;
    // console.log("Constructed Direct Yahoo URL:", url);

    try {
        // Attempt the direct fetch call
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (Linux; Android 10; Pixel 3 XL) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Mobile Safari/537.36',
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.6 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Gecko/20100101 Firefox/89.0'
        ];
        const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];

        const response = await fetch(url, {
            method: 'GET',
            // headers: {
            //     'User-Agent': randomUserAgent
            // }
        });

        // Check for HTTP errors (e.g., 404 Not Found, 500 Server Error)
        if (!response.ok) {
            // This code might run if CORS headers are present but the status is bad,
            // but often CORS fails before this point.
            let errorMsg = `HTTP error! Status: ${response.status}`;
            try {
                const errorData = await response.json(); // Try parsing error body
                errorMsg += `, Body: ${JSON.stringify(errorData)}`;
            } catch (e) {
                errorMsg += `, Body: ${await response.text()}`; // Fallback to text
            }
            // console.error("Direct Yahoo fetch returned an HTTP error:", errorMsg);
            throw new Error(errorMsg);
        }

        // Try parsing the JSON response
        const data = await response.json();
        // console.log("Received RAW data directly from Yahoo (likely needs processing):", data);

        // Check for errors within the Yahoo JSON response itself
        if (data?.chart?.error) {
            console.error("Yahoo API returned an error object:", data.chart.error);
            throw new Error(`Yahoo API Error: ${data.chart.error.description || JSON.stringify(data.chart.error)}`);
        }
        if (!data?.chart?.result || !data.chart.result[0]?.timestamp || !data.chart.result[0]?.indicators?.quote[0]) {
            console.warn("Yahoo API response structure might be invalid or missing data.");
            // Depending on requirements, you might want to throw an error here
            // throw new Error("Yahoo API response structure invalid or missing data.");
        }

        // Return the RAW, UNPROCESSED data
        return data;

    } catch (error) {
        // This CATCH block is the MOST LIKELY place execution will end due to CORS
        // console.error('Error during direct fetch from Yahoo:', error);
        // if (error.name === 'TypeError' && error.message.includes('fetch')) {
        //      // Provide a more specific message for the likely CORS failure
        //     console.error("\nFETCH FAILED: This is likely due to CORS restrictions. The browser is blocking the request from your web page's origin ('" + window.location.origin + "') to '" + _BASE_URL_ + "'. Using a backend proxy is the standard solution.\n");
        // }
        // Re-throw the original error for the caller
        return null;
    }
}

// Example of how you might try to use this (EXPECTED TO FAIL in browser):

async function grabData(ticker, interval, startDate, endDate) {
    try {
        const yahooData = await fetchDirectYahooData(ticker, interval, startDate, endDate);
        if (yahooData == null) {
            return null;
        }
        // console.log("Test Direct Fetch Result (Raw Data):", yahooData);

        // yahooData?.chart?.result[0]?.indicators?.quote[0]; - [ 'close', 'volume', 'low', 'open', 'high' ]
        // yahooData?.chart?.result[0]?.timestamp; - [ 1717027200, 1717113600, 1717200000, ... ]

        const timestamps = yahooData?.chart?.result[0]?.timestamp;
        const prices = yahooData?.chart?.result[0]?.indicators?.quote[0];

        let data = [];
        for (let i = 0; i < timestamps.length; i++) {
            data.push([timestamps[i], prices.open[i], prices.high[i], prices.low[i], prices.close[i], prices.volume[i]])
        }

        return data;

    } catch (e) {
        console.log(e)
        // console.error("Test direct fetch failed miserably, as expected (likely CORS):", e);
        // Maybe update UI to inform user?
        return null;
    }
}



