#!/usr/bin/env node

/**
 * Site builder for registry.siros.org
 * 
 * Fetches VCTMs from registered repositories and generates a static site.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const Handlebars = require('handlebars');

const CONFIG_FILE = path.join(__dirname, '..', 'config', 'repositories.txt');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const STATIC_DIR = path.join(__dirname, '..', 'static');
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Register Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b);
Handlebars.registerHelper('gt', (a, b) => a > b);
Handlebars.registerHelper('subtract', (a, b) => a - b);
Handlebars.registerHelper('or', function() {
    const args = Array.prototype.slice.call(arguments, 0, -1);
    return args.some(Boolean);
});
Handlebars.registerHelper('currentYear', () => new Date().getFullYear());

/**
 * Fetch JSON from a URL with redirect and timeout handling
 */
function fetchJSON(url, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout fetching ${url}`));
        }, 5000);

        const makeRequest = (requestUrl, redirectsLeft) => {
            const req = https.get(requestUrl, {
                headers: { 'User-Agent': 'registry.siros.org-builder/0.1.0' }
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectsLeft <= 0) {
                        clearTimeout(timeout);
                        reject(new Error(`Too many redirects for ${url}`));
                        return;
                    }
                    makeRequest(res.headers.location, redirectsLeft - 1);
                    return;
                }

                if (res.statusCode === 404) {
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                }
                if (res.statusCode !== 200) {
                    clearTimeout(timeout);
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    clearTimeout(timeout);
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Invalid JSON from ${url}`));
                    }
                });
            });
            req.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        };

        makeRequest(url, maxRedirects);
    });
}

/**
 * Fetch raw content from a URL with redirect and timeout handling
 */
function fetchRaw(url, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout fetching ${url}`));
        }, 5000);

        const makeRequest = (requestUrl, redirectsLeft) => {
            const req = https.get(requestUrl, {
                headers: { 'User-Agent': 'registry.siros.org-builder/0.1.0' }
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    if (redirectsLeft <= 0) {
                        clearTimeout(timeout);
                        reject(new Error(`Too many redirects for ${url}`));
                        return;
                    }
                    makeRequest(res.headers.location, redirectsLeft - 1);
                    return;
                }

                if (res.statusCode === 404) {
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                }
                if (res.statusCode !== 200) {
                    clearTimeout(timeout);
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    clearTimeout(timeout);
                    resolve(data);
                });
            });
            req.on('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        };

        makeRequest(url, maxRedirects);
    });
}

/**
 * Load repositories from config file
 */
function loadRepositories() {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
}

/**
 * Fetch VCTM registry from a repository's vctm branch
 */
async function fetchRepoVCTMs(repo) {
    const [owner, name] = repo.split('/');
    const baseUrl = `https://raw.githubusercontent.com/${owner}/${name}/vctm`;
    
    console.log(`Fetching from ${repo}...`);
    
    // Fetch registry metadata
    const registryUrl = `${baseUrl}/.well-known/vctm-registry.json`;
    const registry = await fetchJSON(registryUrl);
    
    if (!registry) {
        console.warn(`  No vctm-registry.json found in ${repo}`);
        return null;
    }
    
    // Fetch each VCTM file listed in the registry (in parallel)
    const files = registry.vctms || [];
    
    const vctmPromises = files.map(async (file) => {
        const vctmUrl = `${baseUrl}/${file.path}`;
        const vctm = await fetchJSON(vctmUrl);
        
        if (vctm) {
            console.log(`  Found: ${file.path}`);
            return {
                name: file.name || path.basename(file.path, '.json'),
                path: file.path,
                vctm,
                source: {
                    repo,
                    owner,
                    repoName: name,
                    url: `https://github.com/${repo}`,
                    commit: registry.commit,
                    timestamp: registry.timestamp
                }
            };
        }
        return null;
    });
    
    const vctmResults = await Promise.all(vctmPromises);
    const vctms = vctmResults.filter(v => v !== null);
    
    return {
        owner,
        repo: name,
        registry,
        vctms
    };
}

/**
 * Organize VCTMs by organization
 */
function organizeByOrg(repoData) {
    const byOrg = {};
    
    for (const data of repoData) {
        if (!data || !data.vctms.length) continue;
        
        const org = data.owner;
        if (!byOrg[org]) {
            byOrg[org] = {
                name: org,
                repos: [],
                vctms: []
            };
        }
        
        byOrg[org].repos.push(data.repo);
        byOrg[org].vctms.push(...data.vctms);
    }
    
    return byOrg;
}

/**
 * Compile Handlebars templates
 */
function loadTemplates() {
    const templates = {};
    
    const templateFiles = ['index.html', 'org.html', 'vctm.html'];
    for (const file of templateFiles) {
        const templatePath = path.join(TEMPLATES_DIR, file);
        if (fs.existsSync(templatePath)) {
            templates[file.replace('.html', '')] = Handlebars.compile(
                fs.readFileSync(templatePath, 'utf-8')
            );
        }
    }
    
    // Load docs templates
    const docsDir = path.join(TEMPLATES_DIR, 'docs');
    if (fs.existsSync(docsDir)) {
        templates.docs = {};
        for (const file of fs.readdirSync(docsDir)) {
            if (file.endsWith('.html')) {
                const name = path.basename(file, '.html');
                templates.docs[name] = Handlebars.compile(
                    fs.readFileSync(path.join(docsDir, file), 'utf-8')
                );
            }
        }
    }
    
    // Register partials
    const partialsDir = path.join(TEMPLATES_DIR, 'partials');
    if (fs.existsSync(partialsDir)) {
        for (const file of fs.readdirSync(partialsDir)) {
            const name = path.basename(file, '.html');
            Handlebars.registerPartial(name, 
                fs.readFileSync(path.join(partialsDir, file), 'utf-8')
            );
        }
    }
    
    return templates;
}

/**
 * Copy static assets
 */
function copyStatic() {
    if (!fs.existsSync(STATIC_DIR)) return;
    
    const copyRecursive = (src, dest) => {
        if (fs.statSync(src).isDirectory()) {
            fs.mkdirSync(dest, { recursive: true });
            for (const file of fs.readdirSync(src)) {
                copyRecursive(path.join(src, file), path.join(dest, file));
            }
        } else {
            fs.copyFileSync(src, dest);
        }
    };
    
    copyRecursive(STATIC_DIR, path.join(DIST_DIR, 'static'));
}

/**
 * Generate the static site
 */
async function build() {
    console.log('Building registry.siros.org...\n');
    
    // Clean and create dist directory
    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true });
    }
    fs.mkdirSync(DIST_DIR, { recursive: true });
    
    // Load repositories
    const repos = loadRepositories();
    console.log(`Found ${repos.length} registered repositories\n`);
    
    // Fetch VCTMs from all repositories (in parallel)
    const repoPromises = repos.map(async (repo) => {
        try {
            return await fetchRepoVCTMs(repo);
        } catch (err) {
            console.error(`  Error fetching ${repo}: ${err.message}`);
            return null;
        }
    });
    
    const repoResults = await Promise.all(repoPromises);
    const repoData = repoResults.filter(data => data !== null);
    
    console.log('\nOrganizing VCTMs...');
    const byOrg = organizeByOrg(repoData);
    
    // Load templates
    const templates = loadTemplates();
    
    // Generate index page
    const orgs = Object.values(byOrg).map(org => ({
        ...org,
        vctmCount: org.vctms.length
    }));
    
    const totalVctms = orgs.reduce((sum, org) => sum + org.vctmCount, 0);
    const buildTime = new Date().toISOString();
    
    if (templates.index) {
        const indexHtml = templates.index({
            title: 'VCTM Registry',
            rootPath: './',
            orgs,
            totalVctms,
            totalOrgs: orgs.length,
            buildTime
        });
        fs.writeFileSync(path.join(DIST_DIR, 'index.html'), indexHtml);
        console.log('Generated index.html');
    }
    
    // Generate documentation pages
    if (templates.docs) {
        const docsDir = path.join(DIST_DIR, 'docs');
        fs.mkdirSync(docsDir, { recursive: true });
        
        for (const [name, template] of Object.entries(templates.docs)) {
            const html = template({
                title: `${name.charAt(0).toUpperCase() + name.slice(1).replace(/-/g, ' ')} - VCTM Registry`,
                rootPath: '../',
                buildTime
            });
            fs.writeFileSync(path.join(docsDir, `${name}.html`), html);
            console.log(`Generated docs/${name}.html`);
        }
    }
    
    // Generate org pages and VCTM files
    for (const [orgName, org] of Object.entries(byOrg)) {
        const orgDir = path.join(DIST_DIR, orgName);
        fs.mkdirSync(orgDir, { recursive: true });
        
        // Org index page
        if (templates.org) {
            const orgHtml = templates.org({
                title: `${orgName} - VCTM Registry`,
                rootPath: '../',
                org,
                vctms: org.vctms,
                buildTime
            });
            fs.writeFileSync(path.join(orgDir, 'index.html'), orgHtml);
            console.log(`Generated ${orgName}/index.html`);
        }
        
        // Individual VCTM pages and JSON files
        for (const vctmData of org.vctms) {
            const vctmName = vctmData.name;
            
            // Write raw VCTM JSON
            fs.writeFileSync(
                path.join(orgDir, `${vctmName}.json`),
                JSON.stringify(vctmData.vctm, null, 2)
            );
            console.log(`Generated ${orgName}/${vctmName}.json`);
            
            // Write HTML detail page
            if (templates.vctm) {
                const vctmHtml = templates.vctm({
                    title: `${vctmData.vctm.name || vctmName} - VCTM Registry`,
                    rootPath: '../',
                    vctm: vctmData.vctm,
                    source: vctmData.source,
                    org: orgName,
                    name: vctmName,
                    jsonUrl: `${vctmName}.json`,
                    rawJson: JSON.stringify(vctmData.vctm, null, 2),
                    buildTime
                });
                fs.writeFileSync(path.join(orgDir, `${vctmName}.html`), vctmHtml);
                console.log(`Generated ${orgName}/${vctmName}.html`);
            }
        }
    }
    
    // Copy static assets
    copyStatic();
    
    // Create CNAME for GitHub Pages custom domain
    fs.writeFileSync(path.join(DIST_DIR, 'CNAME'), 'registry.siros.org\n');
    console.log('Generated CNAME');
    
    // Generate .well-known directory
    const wellKnownDir = path.join(DIST_DIR, '.well-known');
    fs.mkdirSync(wellKnownDir, { recursive: true });
    
    // Generate registry index
    const registryIndex = {
        name: 'SIROS VCTM Registry',
        url: 'https://registry.siros.org',
        version: '1.0',
        organizations: Object.keys(byOrg),
        vctms: Object.values(byOrg).flatMap(org => 
            org.vctms.map(v => ({
                vct: v.vctm.vct,
                name: v.vctm.name,
                org: org.name,
                path: `/${org.name}/${v.name}.json`
            }))
        ),
        buildTime
    };
    
    fs.writeFileSync(
        path.join(wellKnownDir, 'vctm-registry.json'),
        JSON.stringify(registryIndex, null, 2)
    );
    console.log('Generated .well-known/vctm-registry.json');
    
    console.log(`\nBuild complete! Generated ${totalVctms} VCTMs from ${orgs.length} organizations.`);
}

// Run build
build().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
