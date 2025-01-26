require("dotenv").config();
const fs = require("fs");
const express = require("express");
const { chromium } = require("playwright");
const TelegramBot = require("node-telegram-bot-api");

// ----------------------------------------
// Configuration
// ----------------------------------------

const app = express();
const port = 3000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error("Error: TELEGRAM_BOT_TOKEN is not set in environment variables!");
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

const supportedDomains = [
  "mofos",
  "realitykings",
  "spicevids",
  "fakehub",
  "brazzers",
  "twistys",
  "propertysex",
  "digitalplayground",
];

const staticIban = "LV64NDEA7673603264273";
const staticBic = "NDEALV2X";

let browser;

// ----------------------------------------
// Utility / Helper functions
// ----------------------------------------

function generateRandomString(length) {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => characters.charAt(Math.floor(Math.random() * characters.length))).join('');
}

function generateRandomPhone() {
  return Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('');
}

function generateRandomName() {
  const firstNames = ["John", "Jane", "Alice", "Bob", "Charlie", "David", "Eve", "Frank", "Grace", "Henry"];
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez"];
  return {
    firstName: firstNames[Math.floor(Math.random() * firstNames.length)],
    lastName: lastNames[Math.floor(Math.random() * lastNames.length)],
  };
}

const LOG_FILE = "automation_log.txt";

function logRequest(domain, user) {
  const timestamp = new Date().toISOString();
  const logMessage = `${timestamp} | Domain: ${domain} | UserID: ${user.id} | Username: ${user.username || "N/A"} | FirstName: ${user.first_name}\n`;
  fs.appendFile(LOG_FILE, logMessage, (err) => {
    if (err) console.error("[ERROR] Failed to log request:", err.message);
  });
}

// ----------------------------------------
// Browser Initialization (Playwright)
// ----------------------------------------

async function initBrowser() {
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  console.log("[INIT] Browser launched successfully.");
}

// ----------------------------------------
// Automation function
// ----------------------------------------

async function automateWebsite(domain) {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const url = `https://${domain}.com/joinf`;
    await page.goto(url, { waitUntil: "load", timeout: 100000 });

    const randomEmail = `${generateRandomString(12)}@somemail.com`;
    await page.getByLabel('Email').fill(randomEmail);

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForLoadState("load", { timeout: 10000 });

    const { firstName, lastName } = generateRandomName();
    const username = generateRandomString(10);
    const password = generateRandomString(12);
    const address1 = generateRandomString(12);
    const city = generateRandomString(5);
    const zipcode = generateRandomString(5);
    const phone = generateRandomPhone();

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('First Name').fill(firstName);
    await page.getByLabel('Last Name').fill(lastName);
    await page.getByLabel('Address').fill(address1);
    await page.getByLabel('City').fill(city);
    await page.getByLabel('Zip Code').fill(zipcode);
    await page.getByLabel('Phone').fill(phone);

    await page.getByRole('button', { name: 'Next Step' }).click();
    await page.waitForLoadState("load", { timeout: 100000 });

    const agreementCheckbox = page.getByLabel('I agree to the terms and conditions');
    if (!(await agreementCheckbox.isChecked())) {
      await agreementCheckbox.check();
    }

    await page.getByLabel('IBAN').fill(staticIban);
    await page.getByLabel('BIC').fill(staticBic);

    const sepaCheckbox = page.getByLabel('I authorize the SEPA mandate');
    if (!(await sepaCheckbox.isChecked())) {
      await sepaCheckbox.check();
    }

    await page.getByRole('button', { name: 'Submit' }).click();
    await page.waitForLoadState("load", { timeout: 100000 });

    return {
      username,
      password,
      link: `https://site-ma.${domain}.com`,
    };
  } catch (err) {
    console.error(`[ERROR] automateWebsite: ${err.message}`);
    throw err;
  } finally {
    await page.close();
    await context.close();
  }
}

// ----------------------------------------
// Express Routes
// ----------------------------------------

app.get("/", (req, res) => {
  res.json({
    message: "Supported domains:",
    domains: supportedDomains,
  });
});

app.get("/:domain", async (req, res) => {
  const domain = req.params.domain.toLowerCase();
  if (!supportedDomains.includes(domain)) {
    return res.status(400).json({
      error: "Unsupported domain. Choose from the supported domains.",
    });
  }

  try {
    const result = await automateWebsite(domain);
    res.json({ message: "Automation successful!", data: result });
  } catch (error) {
    res.status(500).json({
      error: "An error occurred during automation.",
      details: error.message,
    });
  }
});

// ----------------------------------------
// Telegram Bot Logic
// ----------------------------------------

bot.onText(/\/list/, (msg) => {
  bot.sendMessage(msg.chat.id, `Supported domains:\n${supportedDomains.join("\n")}`);
});

bot.onText(/\/get (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const domain = match[1].toLowerCase();

  if (!supportedDomains.includes(domain)) {
    return bot.sendMessage(chatId, `❌ Unsupported website: ${domain}`);
  }

  bot.sendMessage(chatId, `🚀 Starting process for ${domain}... Please wait.`);

  logRequest(domain, msg.from);

  try {
    const result = await automateWebsite(domain);
    bot.sendMessage(
      chatId,
      `✅ Success!\nUsername: ${result.username}\nPassword: ${result.password}\nLink: ${result.link}`
    );
  } catch (error) {
    bot.sendMessage(chatId, `❌ Automation failed: ${error.message}`);
  }
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Welcome! Use:\n" +
      "/list - Get the list of available websites\n" +
      "/get [website] - to get the username and password of the required website\n" +
      "For example, to get realitykings, use /get realitykings"
  );
});

// ----------------------------------------
// Startup
// ----------------------------------------

(async () => {
  await initBrowser();
  app.listen(port, () => {
    console.log(`[INIT] Server running on http://localhost:${port}`);
  });
})().catch((err) => {
  console.error("[FATAL] Failed to launch the app:", err);
  process.exit(1);
});
