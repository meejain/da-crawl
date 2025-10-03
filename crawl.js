// Import jsdom for HTML parsing in Node.js
import { JSDOM } from 'jsdom';

// Create a global DOMParser using jsdom
const dom = new JSDOM();
global.DOMParser = dom.window.DOMParser;
// Authorization Bearer token from environment variable
const bearerToken = process.env.ADOBE_BEARER_TOKEN || '';

// Helper function to make authenticated requests
async function authenticatedFetch(url, options = {}) {
  const defaultOptions = {
    ...options,
    headers: {
      'Authorization': `Bearer ${bearerToken}`,
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Referer': 'https://da.live/',
      ...options.headers
    }
  };
  
  const response = await fetch(url, defaultOptions);
  return response;
}

// Simple crawl function implementation
async function crawl({ path, callback, concurrent = 50 }) {
  const files = [];
  const folders = [path];
  const inProgress = [];
  
  const results = new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (folders.length > 0) {
        inProgress.push(true);
        const currentPath = folders.pop();
        
        try {
          // Get children of current path
          const resp = await authenticatedFetch(`https://admin.da.live/list${currentPath}`);
          if (resp.ok) {
            const json = await resp.json();
            json.forEach((child) => {
              if (child.ext) {
                files.push(child);
                // Process file with callback
                if (callback) {
                  callback(child).catch(console.error);
                }
              } else {
                folders.push(child.path);
              }
            });
          }
        } catch (error) {
          console.error(`Error processing ${currentPath}:`, error);
        }
        
        inProgress.pop();
      }
      
      if (inProgress.length === 0 && folders.length === 0) {
        clearInterval(interval);
        resolve(files);
      }
    }, 100);
  });
  
  return { results };
}

// Main execution function
async function main() {
  const path = '/audemars-piguet/fondationsaudemarspiguet';
  console.log(`🚀 Starting crawl of: ${path}`);

  const callback = async (item) => {
    // Die if not a document
    if (!item.path.endsWith('.html')) return;

    // Fetch the doc & convert to DOM
    const resp = await authenticatedFetch(`https://admin.da.live/source${item.path}`);
    if (!resp.ok) {
      console.log('Could not fetch item');
      return;
    }
    const text = await resp.text();
    const dom = new DOMParser().parseFromString(text, 'text/html');

    // Check for blank/empty pages
    const body = dom.body;
    const bodyText = body ? body.textContent.trim() : '';
    const bodyHTML = body ? body.innerHTML.trim() : '';
    
    // Remove common whitespace and check for truly empty content
    const cleanText = bodyText.replace(/\s+/g, ' ').trim();
    const cleanHTML = bodyHTML.replace(/\s+/g, ' ').trim();
    
    // Check for truly blank/empty pages
    const isBlankPage = 
      cleanText === '' || // Completely empty text
      cleanHTML === '' || // Completely empty HTML
      cleanText.length === 0 || // Zero characters
      cleanHTML.length === 0 || // Zero HTML
      cleanText === ' ' || // Only whitespace
      cleanHTML === ' ' || // Only whitespace in HTML
      // Check if body only contains empty divs, spans, or other empty elements
      (body && body.children.length === 0) || // No child elements
      (body && body.children.length === 1 && body.children[0].textContent.trim() === '') || // Only empty child
      // Check for pages with only navigation/header/footer but no main content
      (cleanText.length < 20 && !cleanText.match(/[a-zA-Z]{3,}/)); // Less than 20 chars and no meaningful words

    if (isBlankPage) {
      console.log(`🚨 BLANK PAGE DETECTED: ${item.path}`);
      console.log(`   Text content: "${cleanText}"`);
      console.log(`   HTML length: ${cleanHTML.length} characters`);
      console.log(`   Body children: ${body ? body.children.length : 0}`);
      console.log(`   Raw text length: ${bodyText.length}`);
      console.log('---');
      
      // Skip updating this blank page
      return;
    } else {
      console.log(`✅ Page has content: ${item.path} (${cleanText.length} chars)`);
    }

    const html = dom.body.outerHTML;
    const data = new Blob([html], { type: 'text/html' });

    const formData = new FormData();
    formData.append('data', data);

    const url = `https://admin.da.live/source${item.path}`;
    const opts = { method: 'POST', body: formData };
    await authenticatedFetch(url, opts);
  };

  // Crawl the tree of content
  const { results } = crawl({ path, callback, concurrent: 50 });
  const files = await results;
  console.log(`\n🎉 Crawl completed! Found ${files ? files.length : 0} files total.`);
}

// Run the main function
main().catch(console.error);