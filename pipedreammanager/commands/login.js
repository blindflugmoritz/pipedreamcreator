const puppeteer = require('puppeteer');
require('dotenv').config();

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(options) {
  const username = options.username || process.env.PIPEDREAM_USERNAME;
  const password = options.password || process.env.PIPEDREAM_PASSWORD;

  if (!username || !password) {
    console.error('Username and password are required. Provide via options or .env file');
    process.exit(1);
  }

  console.log('Launching browser to login to Pipedream...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36');
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://pipedream.com/auth/login', { waitUntil: 'networkidle0' });
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'login-page.png' });
    console.log('Saved screenshot of login page to login-page.png');
    
    // Wait for the email field (textarea with placeholder)
    console.log('Entering login credentials...');
    await page.waitForSelector('textarea[placeholder="name@company.com"]');
    
    // Fill email field
    await page.type('textarea[placeholder="name@company.com"]', username);
    await sleep(500);
    
    // Tab to password field
    await page.keyboard.press('Tab');
    await sleep(500);
    
    // Fill password field (input type=password)
    await page.keyboard.type(password);
    await sleep(500);
    
    // Take a screenshot before submitting
    await page.screenshot({ path: 'before-signin.png' });
    
    // Click the Sign In button - find by text
    const signInButtonClicked = await page.evaluate(() => {
      // Find all elements containing the text
      const elements = Array.from(document.querySelectorAll('*')).filter(el => 
        el.textContent.trim() === 'Sign in'
      );
      
      // For each matching element, check if it's clickable or has a clickable parent
      for (const el of elements) {
        // Check if the element itself is clickable
        if (
          el.tagName === 'BUTTON' ||
          el.tagName === 'A' ||
          el.getAttribute('role') === 'button' ||
          el.onclick ||
          el.className.includes('button')
        ) {
          el.click();
          return true;
        }
        
        // Check for clickable parent (button, link, etc.)
        let parent = el.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          if (
            parent.tagName === 'BUTTON' ||
            parent.tagName === 'A' ||
            parent.getAttribute('role') === 'button' ||
            parent.onclick ||
            parent.className.includes('button')
          ) {
            parent.click();
            return true;
          }
          parent = parent.parentElement;
          depth++;
        }
      }
      
      return false;
    });
    
    if (!signInButtonClicked) {
      console.log('Could not find Sign in button, pressing Enter instead...');
      await page.keyboard.press('Enter');
    }
    
    // Wait for navigation after login
    console.log('Logging in...');
    try {
      await page.waitForNavigation({ timeout: 30000 });
    } catch (e) {
      console.log('Navigation timeout - continuing anyway');
    }
    
    // Take a screenshot after login
    await page.screenshot({ path: 'after-login.png' });
    
    // Check if login was successful
    const finalUrl = await page.url();
    if (finalUrl.includes('login') || finalUrl.includes('signin')) {
      console.log('Login failed. Check credentials and screenshots.');
      process.exit(1);
    } else {
      console.log('Successfully logged in to Pipedream!');
    }
    
    // Keep browser open for a bit so user can see the result
    console.log('Keeping browser open for 5 seconds...');
    await sleep(5000);
    
  } catch (error) {
    console.error('Error during login:', error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

module.exports = { login };