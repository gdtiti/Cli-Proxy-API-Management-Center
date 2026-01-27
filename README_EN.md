# CLI Proxy API Management Center (CPAMC)

> A Web management interface based on the official repository with custom modifications

**[English](README_EN.md) | [中文](README.md)**

---

## About This Project

This project is a log monitoring and data visualization management interface developed based on the official [CLI Proxy API WebUI](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)

### Differences from Official Version

This version is consistent with the official version in other functions, with the main differences being:
+ **New Monitoring Center**: Synced from: https://github.com/kongkongyo/Cli-Proxy-API-Management-Center
+ Enhanced credential file management: Independent proxy_url control, User Agent configuration for antigravity credentials, online credential file editing

### Interface Preview

Management interface display

![Dashboard Preview](dashboard-preview.png)


Individual/Batch proxy configuration for authentication files:
<img width="1035" height="507" alt="image" src="https://github.com/user-attachments/assets/c5fa3a02-d326-41e7-8014-672a2ce2a02c" />

Antigravity credentials, batch/individual User Agent header configuration
<img width="1035" height="495" alt="image" src="https://github.com/user-attachments/assets/82fe717b-5b55-4c06-aae7-ade195986641" />
<img width="536" height="289" alt="image" src="https://github.com/user-attachments/assets/76be1e54-45ef-42fe-9537-295458446e3b" />

Credential JSON file editing
<img width="1035" height="514" alt="image" src="https://github.com/user-attachments/assets/62d48bc8-eee4-4206-93e0-6a87b16dcb58" />

Data masking button
<img width="1035" height="456" alt="image" src="https://github.com/user-attachments/assets/824b520b-dc1e-4421-9ef0-2efae0525ac3" />

Browser-saved preferences:
Previously, settings would be lost when changing pages. Now they are stored in the browser, mainly for pagination configuration and data masking toggle button.

---

## Quick Start

### Using This Management Interface

Modify the following configuration in your `config.yaml`:

```yaml
remote-management:
  panel-github-repository: "https://github.com/escapeWu/CLIProxyAPI-Web-Dashboard"
```

After configuration, restart the CLI Proxy API service and visit `http://<host>:<api_port>/management.html` to view the management interface

For detailed configuration instructions, please refer to the official documentation: https://help.router-for.me/cn/management/webui.html

## Related Links

- **Official Main Program**: https://github.com/router-for-me/CLIProxyAPI
- **Official WebUI**: https://github.com/router-for-me/Cli-Proxy-API-Management-Center
- **Monitoring Center Version Repository**: https://github.com/kongkongyo/CLIProxyAPI-Web-Dashboard

## License

MIT License
