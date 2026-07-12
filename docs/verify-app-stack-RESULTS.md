# Verify app theming stack

Generated: 2026-07-12T01:13:39.089Z  
Mermaid: 11.16.0  
Stack: `initialize(base+themeVariables) + frontmatter + classDef default + htmlLabels:false`

## Screenshots

| View | File |
|------|------|
| Full (default vs studio) | ![full](verify-app-stack.png) |
| Studio host only | ![studio](verify-app-stack-studio-host.png) |
| Default host only | ![default](verify-app-stack-default-host.png) |

## Pixel scores (from host PNGs)

| Chart | pale | dark | white | nodeish |
|-------|------|------|-------|---------|
| default | 14 | 46 | 12 | 60 |
| studio | 2 | 58 | 0 | 60 |

## Fill attrs

```json
{
  "def": {
    "fillAttr": "#ECECFF",
    "computed": "rgb(236, 236, 255)"
  },
  "studio": {
    "fillAttr": "#27272a",
    "computed": "rgb(39, 39, 42)"
  },
  "cfg": {
    "theme": "base",
    "mainBkg": "#27272a",
    "primaryColor": "#27272a"
  },
  "mermaidVersion": "11.16.0"
}
```

## Verdict

**STUDIO_DARK_OK**

- defaultLooksPale: true
- studioLooksDark: true
