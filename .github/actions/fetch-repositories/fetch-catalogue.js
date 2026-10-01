const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

/**
 * CatalogueFetcher - Optimized GitHub Repository Fetcher
 *
 * This class fetches repository data from GitHub's Search API and generates
 * a JSON file containing only the fields actually used by the git-catalogue UI.
 *
 * Optimization: Instead of returning 100+ fields per repository, we only include
 * the ~20 fields that are actually displayed in the catalogue interface, reducing
 * file size by approximately 80% and improving load times.
 *
 * Fields included:
 * - Core: id, name, full_name, description, stargazers_count, created_at, default_branch
 * - Owner: login, avatar_url, html_url
 * - Details: html_url, forks_count, watchers_count, subscribers_count, pushed_at, updated_at
 * - Optional: license.spdx_id, topics
 *
 * subscribers_count (the real "watch" count) and fresh owner/full_name are only
 * available from a direct per-repo GET, not the search API, so those are re-checked
 * at most once every DETAIL_REFRESH_HOURS per repo instead of on every run.
 */

class CatalogueFetcher {
  constructor() {
    this.token = process.env.GITHUB_TOKEN;
    this.organizations = JSON.parse(process.env.ORGANIZATIONS || '["default-org"]');
    this.topics = JSON.parse(process.env.TOPICS || '{}');
    this.globalSearch = process.env.GLOBAL_SEARCH === 'true';
    this.outputPath = process.env.OUTPUT_PATH || 'data/catalogue.json';
    this.perPage = parseInt(process.env.PER_PAGE) || 100;
    this.maxRetries = parseInt(process.env.MAX_RETRIES) || 3;
    this.rateLimit = parseInt(process.env.RATE_LIMIT_DELAY) || 1;
    this.detailRefreshHours = parseInt(process.env.DETAIL_REFRESH_HOURS) || 24;
    this.totalRepos = 0;
  }

  // Normalize a single repo entry to a consistent property order and stable nested arrays
  normalizeRepoEntry(repo, previousData, nowIso) {
    const owner = repo.owner || {};
    const license = repo.license ? { spdx_id: repo.license.spdx_id } : null;
    const topics = Array.isArray(repo.topics) ? [...repo.topics].sort((a, b) => a.localeCompare(b)) : [];
    const previous = previousData && previousData.get(repo.id);
    return {
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      stargazers_count: repo.stargazers_count,
      created_at: repo.created_at,
      added_at: (previous && previous.added_at) || nowIso,
      default_branch: repo.default_branch,
      owner: {
        login: owner.login,
        avatar_url: owner.avatar_url,
        html_url: owner.html_url
      },
      html_url: repo.html_url,
      forks_count: repo.forks_count,
      watchers_count: repo.watchers_count,
      subscribers_count: repo.subscribers_count,
      details_fetched_at: repo.details_fetched_at || nowIso,
      pushed_at: repo.pushed_at,
      updated_at: repo.updated_at,
      license: license,
      topics
    };
  }

  // Normalize an array of repositories for stable ordering
  normalizeRepositories(repositories) {
    const toTime = (v) => {
      if (!v) return 0;
      try {
        return (v instanceof Date) ? v.getTime() : new Date(v).getTime();
      } catch (_) {
        return 0;
      }
    };

    return [...repositories].sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }
      const bt = toTime(b.pushed_at);
      const at = toTime(a.pushed_at);
      if (bt !== at) {
        return bt - at;
      }
      const af = (a.full_name || '').toLowerCase();
      const bf = (b.full_name || '').toLowerCase();
      if (af < bf) return -1;
      if (af > bf) return 1;
      return 0;
    });
  }

  // Reads the *existing* output file (before it gets overwritten) so we can carry
  // forward the date a repository first appeared in the catalogue, and know when
  // its subscribers_count/owner details were last refreshed.
  loadPreviousRepoData() {
    const previousData = new Map();
    try {
      if (fs.existsSync(this.outputPath)) {
        const previous = JSON.parse(fs.readFileSync(this.outputPath, 'utf8'));
        const orgs = previous.organizations || {};
        for (const org of Object.keys(orgs)) {
          const topics = orgs[org] || {};
          for (const topic of Object.keys(topics)) {
            const repos = topics[topic] || [];
            for (const repo of repos) {
              if (repo && typeof repo.id === 'number') {
                previousData.set(repo.id, repo);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Could not read previous catalogue:', error.message);
    }
    return previousData;
  }

  // Build a normalized catalogue object with deterministic key and array order.
  // Note: intentionally no generated_at field to avoid false diffs.
  buildNormalizedCatalogue(raw, previousData, nowIso) {
    const normalized = {
      global_search: !!raw.global_search,
      organizations: {}
    };

    const orgKeys = Object.keys(raw.organizations || {}).sort((a, b) => a.localeCompare(b));
    for (const org of orgKeys) {
      const topics = raw.organizations[org] || {};
      const topicKeys = Object.keys(topics).sort((a, b) => a.localeCompare(b));
      normalized.organizations[org] = {};
      for (const topic of topicKeys) {
        const repos = Array.isArray(topics[topic]) ? topics[topic] : [];
        const sortedRepos = this.normalizeRepositories(repos).map(r => this.normalizeRepoEntry(r, previousData, nowIso));
        normalized.organizations[org][topic] = sortedRepos;
      }
    }

    return normalized;
  }

  async delay(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  async fetchWithRetry(url, options = {}, retries = 0) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `token ${this.token}`,
          'User-Agent': 'Git-Catalogue-Action',
          'Accept': 'application/vnd.github.v3+json',
          ...options.headers
        }
      });

      // Handle rate limiting
      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        const resetTime = parseInt(response.headers.get('x-ratelimit-reset')) * 1000;
        const waitTime = Math.max(resetTime - Date.now(), 0) + 1000;
        console.log(`Rate limit hit. Waiting ${waitTime/1000} seconds...`);
        await this.delay(waitTime / 1000);
        return this.fetchWithRetry(url, options, retries);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      if (retries < this.maxRetries) {
        console.log(`Request failed, retrying... (${retries + 1}/${this.maxRetries})`);
        await this.delay(Math.pow(2, retries)); // Exponential backoff
        return this.fetchWithRetry(url, options, retries + 1);
      }
      throw error;
    }
  }

  // The search API used below never returns subscribers_count (the real
  // "watch" count) and can lag behind a repo rename/transfer. A direct
  // per-repo GET always reflects the current owner/name and includes it.
  async fetchRepositoryDetails(repo) {
    try {
      const response = await this.fetchWithRetry(repo.url);
      return await response.json();
    } catch (error) {
      console.warn(`Could not fetch details for ${repo.full_name}: ${error.message}`);
      return repo;
    }
  }

  async fetchRepositoriesForTopic(org, topic, previousData) {
    const repositories = [];
    let page = 1;
    let hasMore = true;
    const detailRefreshMs = this.detailRefreshHours * 3600 * 1000;
    const nowIso = new Date().toISOString();

    console.log(`Fetching repositories for ${this.globalSearch ? 'global' : org}/${topic}...`);

    while (hasMore) {
      // Build query with proper GitHub search syntax (spaces, not +)
      let query = '';
      if (!this.globalSearch && org) {
        query += `org:${org} `;
      }
      // For global search, omit fork:true to include all repos with topic
      if (!this.globalSearch) {
        query += 'fork:true ';
      }
      if (topic) {
        // Handle compound topics like "azerothcore-module+azerothcore-lua"
        if (topic.includes('+')) {
          const topics = topic.split('+');
          topics.forEach(t => {
            query += `topic:${t.trim()} `;
          });
        } else {
          query += `topic:${topic} `;
        }
      }
      query = query.trim();

      const url = `https://api.github.com/search/repositories?page=${page}&per_page=${this.perPage}&q=${encodeURIComponent(query)}&sort=stars&order=desc`;

      const response = await this.fetchWithRetry(url);
      const data = await response.json();

      if (data.items && data.items.length > 0) {
        // Only re-fetch full details (subscribers_count + current owner/name) for a
        // repo once every DETAIL_REFRESH_HOURS. Everything else (stars, forks,
        // description) already comes fresh from the search results above, so most
        // runs reuse the last-known details instead of paying for an extra request.
        const detailedRepos = [];
        for (const item of data.items) {
          const previous = previousData && previousData.get(item.id);
          const lastFetched = previous && previous.details_fetched_at ? new Date(previous.details_fetched_at).getTime() : 0;
          const isFresh = lastFetched && (Date.now() - lastFetched) < detailRefreshMs;

          if (isFresh) {
            detailedRepos.push({
              ...item,
              owner: previous.owner || item.owner,
              full_name: previous.full_name || item.full_name,
              html_url: previous.html_url || item.html_url,
              subscribers_count: previous.subscribers_count,
              details_fetched_at: previous.details_fetched_at
            });
          } else {
            const detail = await this.fetchRepositoryDetails(item);
            detail.details_fetched_at = nowIso;
            detailedRepos.push(detail);
            await this.delay(this.rateLimit);
          }
        }

        // Process repositories with only the fields actually used by the catalogue
        const processedRepos = detailedRepos.map(repo => ({
          // Core fields used in list view
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          stargazers_count: repo.stargazers_count,
          created_at: new Date(repo.created_at),
          default_branch: repo.default_branch,

          // Owner fields (used for avatar and profile links)
          owner: {
            login: repo.owner.login,
            avatar_url: repo.owner.avatar_url,
            html_url: repo.owner.html_url
          },

          // Additional fields used in details view
          html_url: repo.html_url,
          forks_count: repo.forks_count,
          watchers_count: repo.watchers_count,
          subscribers_count: repo.subscribers_count, // The real "watch" count
          details_fetched_at: repo.details_fetched_at,
          pushed_at: new Date(repo.pushed_at),
          updated_at: new Date(repo.updated_at),

          // Optional fields
          license: repo.license ? {
            spdx_id: repo.license.spdx_id
          } : null,

          // Topics (useful for filtering/debugging)
          topics: repo.topics || []
        }));

        repositories.push(...processedRepos);

        if (data.items.length < this.perPage) {
          hasMore = false;
        } else {
          page++;
        }
      } else {
        hasMore = false;
      }

      // Rate limiting
      await this.delay(this.rateLimit);
    }

    console.log(`Found ${repositories.length} repositories for ${org}/${topic}`);
    return repositories;
  }

  async fetchAllRepositories(previousData) {
    const catalogueData = {
      global_search: this.globalSearch,
      organizations: {}
    };

    if (this.globalSearch) {
      // For global search, organize by topics globally but maintain org structure for compatibility
      const allTopics = new Set();
      Object.values(this.topics).forEach(topics => topics.forEach(topic => allTopics.add(topic)));

      // Use first organization as the key for backwards compatibility
      const primaryOrg = this.organizations[0] || 'default-org';
      catalogueData.organizations[primaryOrg] = {};

      for (const topic of allTopics) {
        try {
          const repositories = await this.fetchRepositoriesForTopic(primaryOrg, topic, previousData);
          catalogueData.organizations[primaryOrg][topic] = repositories;
          this.totalRepos += repositories.length;
        } catch (error) {
          console.error(`Failed to fetch global/${topic}:`, error.message);
          throw error; // Fail the workflow on any fetch error
        }
      }
    } else {
      // Original organization-specific logic
      for (const org of this.organizations) {
        catalogueData.organizations[org] = {};
        const orgTopics = this.topics[org] || [];

        for (const topic of orgTopics) {
          try {
            const repositories = await this.fetchRepositoriesForTopic(org, topic, previousData);
            catalogueData.organizations[org][topic] = repositories;
            this.totalRepos += repositories.length;
          } catch (error) {
            console.error(`Failed to fetch ${org}/${topic}:`, error.message);
            throw error; // Fail the workflow on any fetch error
          }
        }
      }
    }

    return catalogueData;
  }

  async saveCatalogue(data, previousData) {
    const dir = path.dirname(this.outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const nowIso = new Date().toISOString();
    // Always write deterministically ordered content without a timestamp
    const normalized = this.buildNormalizedCatalogue(data, previousData, nowIso);
    fs.writeFileSync(this.outputPath, JSON.stringify(normalized, null, 2));
    console.log(`Catalogue saved to ${this.outputPath}`);
  }

  async run() {
    try {
      console.log('Starting catalogue generation...');
      console.log(`Search Mode: ${this.globalSearch ? '🌍 Global GitHub search' : '🏢 Organization-specific search'}`);
      console.log(`Organizations: ${this.organizations.join(', ')}`);
      console.log(`Topics: ${JSON.stringify(this.topics)}`);
      console.log(`Output path: ${this.outputPath}`);
      console.log(`Detail refresh interval: every ${this.detailRefreshHours}h`);
      console.log('📦 Using optimized field selection (only fields used by catalogue UI)');

      // Read the previous file BEFORE it's overwritten, so we can carry forward
      // added_at and avoid re-fetching subscribers_count/owner every run.
      const previousData = this.loadPreviousRepoData();

      const catalogueData = await this.fetchAllRepositories(previousData);
      await this.saveCatalogue(catalogueData, previousData);

      // Calculate file size reduction info
      const fileSizeKB = Math.round(JSON.stringify(catalogueData).length / 1024);
      console.log(`✅ Generated catalogue with ${this.totalRepos} repositories`);
      console.log(`📊 Output file size: ${fileSizeKB} KB (optimized)`);

      // Set output for GitHub Actions
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `total-repos=${this.totalRepos}\n`);
      }
    } catch (error) {
      console.error('❌ Failed to generate catalogue:', error.message);
      process.exit(1);
    }
  }
}

new CatalogueFetcher().run();
