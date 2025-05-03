const bcrypt = require('bcrypt');


const readline = require('readline');
const fetch = require('node-fetch');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function generatePassword(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return password;
}

async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
}

rl.question('Enter a username: ', async (username) => {
    rl.question('Enter a password: ', async (password) => {
        let link = 'http://localhost:4600/api/create-account';
        // link = 'https://trading.vitalit.solutions/api/create-account';
        const response = await fetch(link, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
    
        const data = await response.json();
        if (data.success) {
            console.log('Account created successfully!');
        } else {
            console.log(data);
            console.log('Failed to create account.');
        }
        rl.close();
    });
});




