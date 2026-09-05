const dns = require('dns');

// Node resolves DNS two different ways:
//   - dns.lookup()  -> the operating system resolver (used by HTTP, npm, etc.)
//   - dns.resolve*() -> Node's bundled c-ares resolver, which reads the adapter
//     list itself. This is what `mongodb+srv://` uses to look up SRV records.
//
// On Windows, virtual adapters (VirtualBox Host-Only, VPN tunnels, WSL) often
// advertise the `fec0:0:0:ffff::1` IPv6 placeholders. c-ares can fail to
// enumerate that list and silently falls back to its built-in 127.0.0.1
// default, where nothing is listening. The symptom is a connection that works
// in the browser and in nslookup but dies with:
//   Error: querySrv ECONNREFUSED _mongodb._tcp.<cluster>.mongodb.net
//
// Setting DNS_SERVERS in .env pins the resolver c-ares uses and sidesteps the
// broken adapter enumeration entirely.

function parseServers(raw) {
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isUnusable(servers) {
  // c-ares' fallback when it cannot read any resolver from the OS.
  return servers.length === 0 || servers.every((s) => s === '127.0.0.1' || s === '::1');
}

function configureDns() {
  const configured = process.env.DNS_SERVERS ? parseServers(process.env.DNS_SERVERS) : null;

  if (configured && configured.length) {
    try {
      dns.setServers(configured);
      dns.promises.setServers(configured);
      return;
    } catch (error) {
      console.error(`Invalid DNS_SERVERS value "${process.env.DNS_SERVERS}": ${error.message}`);
      console.error('Falling back to the system resolver.');
    }
  }

  if (isUnusable(dns.getServers())) {
    console.warn(
      'Warning: Node resolved no usable DNS server and is falling back to 127.0.0.1.\n' +
        '         SRV lookups (mongodb+srv://) will fail with ECONNREFUSED.\n' +
        '         Set DNS_SERVERS in server/.env to your resolver, e.g. DNS_SERVERS=8.8.8.8,8.8.4.4'
    );
  }
}

module.exports = { configureDns };
