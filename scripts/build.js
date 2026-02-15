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
            // Add cache-busting parameter for raw.githubusercontent.com
            let finalUrl = requestUrl;
            if (requestUrl.includes('raw.githubusercontent.com')) {
                const separator = requestUrl.includes('?') ? '&' : '?';
                finalUrl = `${requestUrl}${separator}t=${Date.now()}`;
            }
            
            const req = https.get(finalUrl, {
                headers: { 
                    'User-Agent': 'registry.siros.org-builder/0.1.0',
                    'Connection': 'close',
                    'Cache-Control': 'no-cache'
                }
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume(); // Consume response to free up connection
                    if (redirectsLeft <= 0) {
                        clearTimeout(timeout);
                        reject(new Error(`Too many redirects for ${url}`));
                        return;
                    }
                    makeRequest(res.headers.location, redirectsLeft - 1);
                    return;
                }

                if (res.statusCode === 404) {
                    res.resume(); // Consume response
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume(); // Consume response
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
            // Add cache-busting parameter for raw.githubusercontent.com
            let finalUrl = requestUrl;
            if (requestUrl.includes('raw.githubusercontent.com')) {
                const separator = requestUrl.includes('?') ? '&' : '?';
                finalUrl = `${requestUrl}${separator}t=${Date.now()}`;
            }
            
            const req = https.get(finalUrl, {
                headers: { 
                    'User-Agent': 'registry.siros.org-builder/0.1.0',
                    'Connection': 'close',
                    'Cache-Control': 'no-cache'
                }
            }, (res) => {
                // Handle redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.resume(); // Consume response to free up connection
                    if (redirectsLeft <= 0) {
                        clearTimeout(timeout);
                        reject(new Error(`Too many redirects for ${url}`));
                        return;
                    }
                    makeRequest(res.headers.location, redirectsLeft - 1);
                    return;
                }

                if (res.statusCode === 404) {
                    res.resume(); // Consume response
                    clearTimeout(timeout);
                    resolve(null);
                    return;
                }
                if (res.statusCode !== 200) {
                    res.resume(); // Consume response
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
 * Search GitHub for repositories with the 'vctm' topic
 */
async function discoverRepositoriesByTopic(topic = 'vctm') {
    const searchUrl = `https://api.github.com/search/repositories?q=topic:${topic}`;
    console.log(`Searching GitHub for repositories with topic: ${topic}...`);
    
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout searching GitHub'));
        }, 10000);
        
        const req = https.get(searchUrl, {
            headers: {
                'User-Agent': 'registry.siros.org-builder/0.1.0',
                'Accept': 'application/vnd.github.mercy-preview+json',
                'Connection': 'close'
            }
        }, (res) => {
            if (res.statusCode !== 200) {
                clearTimeout(timeout);
                res.resume();
                console.warn(`  GitHub search returned HTTP ${res.statusCode}`);
                resolve([]);
                return;
            }
            
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(timeout);
                try {
                    const result = JSON.parse(data);
                    const repos = (result.items || []).map(item => item.full_name);
                    console.log(`  Found ${repos.length} repositories with topic '${topic}'`);
                    resolve(repos);
                } catch (e) {
                    console.warn(`  Failed to parse GitHub search results`);
                    resolve([]);
                }
            });
        });
        
        req.on('error', (err) => {
            clearTimeout(timeout);
            console.warn(`  GitHub search failed: ${err.message}`);
            resolve([]);
        });
    });
}

/**
 * Check if a repository has a valid vctm branch with registry
 */
async function validateVctmRepo(repo) {
    const [owner, name] = repo.split('/');
    const registryUrl = `https://raw.githubusercontent.com/${owner}/${name}/vctm/.well-known/vctm-registry.json`;
    
    try {
        const registry = await fetchJSON(registryUrl);
        return registry !== null;
    } catch {
        return false;
    }
}

/**
 * Discover and validate VCTM repositories by GitHub topic
 */
async function loadRepositories() {
    // Discover repositories by GitHub topic
    const discoveredRepos = await discoverRepositoriesByTopic('vctm');
    
    if (discoveredRepos.length === 0) {
        console.log('No repositories found with vctm topic');
        return [];
    }
    
    // Validate each repository in parallel
    console.log('Validating repositories...');
    const validationResults = await Promise.all(
        discoveredRepos.map(async (repo) => {
            const isValid = await validateVctmRepo(repo);
            if (!isValid) {
                console.log(`  Skipping ${repo} (no valid vctm branch)`);
            }
            return { repo, isValid };
        })
    );
    
    const validRepos = validationResults
        .filter(r => r.isValid)
        .map(r => r.repo);
    
    console.log(`Found ${validRepos.length} valid VCTM repositories\n`);
    return validRepos;
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
    // Support both old format (vctms) and new format (credentials)
    const files = registry.credentials || registry.vctms || [];
    
    const vctmPromises = files.map(async (file) => {
        // Support both path (old) and vctm_file (new) formats
        const filePath = file.vctm_file || file.path;
        
        // Derive base name for format detection
        let baseName = filePath;
        // Remove directory prefix if present
        if (baseName.includes('/')) {
            baseName = baseName.split('/').pop();
        }
        // Remove known extensions to get base name
        // Note: .vctm is the old extension (without .json)
        const formatExtensions = ['.vctm.json', '.mdoc.json', '.vc.json', '.vctm', '.json'];
        for (const ext of formatExtensions) {
            if (baseName.endsWith(ext)) {
                baseName = baseName.slice(0, -ext.length);
                break;
            }
        }
        
        // Determine directory prefix
        const dirPrefix = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') + '/' : '';
        
        // Try to fetch the primary VCTM file
        // First try new naming convention (.vctm.json), then fall back to old (.json)
        let vctm = null;
        let actualVctmPath = null;
        
        // Try new naming: name.vctm.json
        const newVctmPath = `${dirPrefix}${baseName}.vctm.json`;
        vctm = await fetchJSON(`${baseUrl}/${newVctmPath}`);
        if (vctm) {
            actualVctmPath = newVctmPath;
        } else {
            // Fall back to old naming: name.json
            vctm = await fetchJSON(`${baseUrl}/${filePath}`);
            if (vctm) {
                actualVctmPath = filePath;
            }
        }
        
        if (!vctm) {
            console.log(`  Not found: ${filePath}`);
            return null;
        }
        
        console.log(`  Found VCTM: ${actualVctmPath}`);
        
        // Try to fetch additional formats (mDOC and W3C)
        const formats = { vctm: { data: vctm, path: actualVctmPath } };
        
        // Try mDOC format (.mdoc.json)
        const mdocPath = `${dirPrefix}${baseName}.mdoc.json`;
        const mdoc = await fetchJSON(`${baseUrl}/${mdocPath}`);
        if (mdoc) {
            formats.mdoc = { data: mdoc, path: mdocPath };
            console.log(`  Found mDOC: ${mdocPath}`);
        }
        
        // Try W3C format (.vc.json)
        const vcPath = `${dirPrefix}${baseName}.vc.json`;
        const vc = await fetchJSON(`${baseUrl}/${vcPath}`);
        if (vc) {
            formats.vc = { data: vc, path: vcPath };
            console.log(`  Found W3C VC: ${vcPath}`);
        }
        
        return {
            name: file.name || baseName,
            path: actualVctmPath,
            vctm,
            formats,
            source: {
                repo,
                owner,
                repoName: name,
                url: `https://github.com/${repo}`,
                commit: registry.repository?.commit || registry.commit,
                timestamp: registry.generated || registry.timestamp
            }
        };
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
    
    // Load and validate repositories (from config file + GitHub topic discovery)
    const repos = await loadRepositories();
    
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
            const formats = vctmData.formats || { vctm: { data: vctmData.vctm } };
            
            // Build list of available formats for the template
            const availableFormats = [];
            
            // Always write VCTM JSON (backwards compat: name.json)
            fs.writeFileSync(
                path.join(orgDir, `${vctmName}.json`),
                JSON.stringify(vctmData.vctm, null, 2)
            );
            console.log(`Generated ${orgName}/${vctmName}.json`);
            availableFormats.push({
                name: 'vctm',
                label: 'SD-JWT VC Type Metadata',
                file: `${vctmName}.json`,
                extension: '.json'
            });
            
            // Also write with new naming convention (name.vctm.json) for consistency
            fs.writeFileSync(
                path.join(orgDir, `${vctmName}.vctm.json`),
                JSON.stringify(vctmData.vctm, null, 2)
            );
            
            // Write mDOC format if available
            if (formats.mdoc) {
                fs.writeFileSync(
                    path.join(orgDir, `${vctmName}.mdoc.json`),
                    JSON.stringify(formats.mdoc.data, null, 2)
                );
                console.log(`Generated ${orgName}/${vctmName}.mdoc.json`);
                availableFormats.push({
                    name: 'mdoc',
                    label: 'mso_mdoc (ISO 18013-5)',
                    file: `${vctmName}.mdoc.json`,
                    extension: '.mdoc.json',
                    data: formats.mdoc.data
                });
            }
            
            // Write W3C VC format if available
            if (formats.vc) {
                fs.writeFileSync(
                    path.join(orgDir, `${vctmName}.vc.json`),
                    JSON.stringify(formats.vc.data, null, 2)
                );
                console.log(`Generated ${orgName}/${vctmName}.vc.json`);
                availableFormats.push({
                    name: 'vc',
                    label: 'W3C Verifiable Credential',
                    file: `${vctmName}.vc.json`,
                    extension: '.vc.json',
                    data: formats.vc.data
                });
            }
            
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
                    availableFormats,
                    hasMultipleFormats: availableFormats.length > 1,
                    mdoc: formats.mdoc?.data,
                    mdocJson: formats.mdoc ? JSON.stringify(formats.mdoc.data, null, 2) : null,
                    vc: formats.vc?.data,
                    vcJson: formats.vc ? JSON.stringify(formats.vc.data, null, 2) : null,
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
    
    // Build comprehensive credentials list with format-specific links
    const credentials = Object.values(byOrg).flatMap(org => 
        org.vctms.map(v => {
            const basePath = `/${org.name}/${encodeURIComponent(v.name)}`;
            const formats = {};
            
            // SD-JWT VC Type Metadata (always present)
            formats.vctm = {
                url: `https://registry.siros.org${basePath}.vctm.json`,
                type: 'application/json',
                spec: 'https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/'
            };
            
            // mso_mdoc (ISO 18013-5) if available
            if (v.formats && v.formats.mdoc) {
                formats.mdoc = {
                    url: `https://registry.siros.org${basePath}.mdoc.json`,
                    type: 'application/json',
                    spec: 'https://www.iso.org/standard/69084.html',
                    doctype: v.formats.mdoc.data?.doctype || null
                };
            }
            
            // W3C VCDM 2.0 if available
            if (v.formats && v.formats.vc) {
                formats.vc = {
                    url: `https://registry.siros.org${basePath}.vc.json`,
                    type: 'application/json',
                    spec: 'https://www.w3.org/TR/vc-data-model-2.0/'
                };
            }
            
            return {
                // Primary identifier
                vct: v.vctm.vct,
                
                // Human-readable metadata
                name: v.vctm.name,
                description: v.vctm.description || null,
                organization: org.name,
                
                // Links to format-specific files
                formats,
                
                // Human-readable page on registry
                metadata: {
                    html: `https://registry.siros.org${basePath}.html`,
                    json: `https://registry.siros.org${basePath}.json`
                },
                
                // Source repository
                source: v.source ? {
                    repository: v.source.url,
                    branch: 'vctm'
                } : null
            };
        })
    );
    
    // Generate registry index
    const registryIndex = {
        '$schema': 'https://registry.siros.org/schemas/vctm-registry.json',
        name: 'SIROS Credential Registry',
        description: 'A public registry of credential metadata for SD-JWT VC, mDOC, and W3C VC ecosystems',
        url: 'https://registry.siros.org',
        version: '2.0',
        organizations: Object.keys(byOrg).map(name => ({
            name,
            url: `https://registry.siros.org/${name}/`,
            credentials: byOrg[name].vctms.length
        })),
        credentials,
        totalCredentials: credentials.length,
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
