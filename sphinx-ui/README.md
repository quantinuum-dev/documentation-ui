# Quantinuum Sphinx

This repo contains templates and static assets that are intended to customize the theme [furo](https://pradyunsg.me/furo/).


### Using the templates in your Sphinx configuration

Add the following git URL as a submodule in the same directory as `conf.py`


In `conf.py` add:

```python
extensions ['quantinuum_sphinx']
html_theme = 'quantinuum_sphinx'
html_favicon = '<path to your favicon file>'
```

Google Analytics is disabled by default. Enable it only for production builds; all Quantinuum documentation uses the default measurement ID, or it can be overridden per site:

```python
html_theme_options = {
    'enable_analytics': True,
    'analytics_id': 'G-YPQ1FTGDL3',
}
```

When analytics is enabled, the navigation bundle reads the measurement ID from the rendered theme configuration and initializes Consent Mode and Google Analytics.

The local demo remains analytics-free by default. Opt in when building it with:

```bash
./build-demo.sh --analytics
```

This uses the theme's default measurement ID. To test another GA4 property:

```bash
./build-demo.sh --analytics-id G-XXXXXXXXXX
```

Create a file `./_static/nav-config.js` containing:

```js
const navConfig = {
    "navTextLinks": [
        {
            "title": string,
            "href": string,
        },
    ],
    "navProductName": string,
    "navIconLinks": [
        {
            "title": string,
            "href": string,
            "iconImageURL": string (i.e. "_static/assets/github.svg"),
        },
    ],
}
```

Rebuild your docs and you should have a navbar:
![Screenshot 2024-07-01 at 14 07 19](https://github.com/CQCL/quantinuum-sphinx/assets/104831665/1dfda0e7-accc-428c-bccd-b489913bf9aa)
