# Project Odysseus Website

Professional Mathematics tutoring website for Grades 8-12 in South Africa.

## 🚀 Quick Start

1. Clone this repository
2. Open `index.html` in your browser
3. For production, deploy to any static hosting (Netlify, Vercel, GitHub Pages)

## ⚙️ Configuration Required

Before going live, update these values in `index.html`:

### 1. WhatsApp Number
Find the `CONFIG` object in the JavaScript section and update:
```javascript
whatsappNumber: '27XXXXXXXXX', // Replace with your actual number
```

### 2. Form Backend (Formspree)
1. Go to [formspree.io](https://formspree.io) and create a free account
2. Create a new form and copy your form ID
3. Update the config:
```javascript
formspreeEndpoint: 'https://formspree.io/f/YOUR_FORM_ID',
```

### 3. Google Analytics
1. Create a property at [analytics.google.com](https://analytics.google.com)
2. Get your Measurement ID (starts with `G-`)
3. Uncomment the Google Analytics section in `<head>` and replace `GA_MEASUREMENT_ID`

### 4. Domain & URLs
Update these in `index.html`:
- Canonical URL
- Open Graph URLs
- Sitemap.xml domain references
- robots.txt sitemap URL

### 5. Open Graph Image
Create a 1200x630px image named `og-image.jpg` for social media sharing.

## 📁 File Structure

```
├── index.html          # Main website
├── privacy.html        # Privacy Policy page
├── terms.html          # Terms of Service page
├── 404.html           # Custom 404 error page
├── favicon.svg        # Browser favicon
├── sitemap.xml        # SEO sitemap
├── robots.txt         # Search engine crawling rules
├── netlify.toml       # Netlify deployment config
└── README.md          # This file
```

## 🎨 Customization

### Colors
The brand colors are defined in the Tailwind config:
- `brand-dark`: #0f172a (Navy)
- `brand-gold`: #fbbf24 (Gold)
- `brand-light`: #f8fafc (Light gray)

### Pricing
Update the pricing packages in the "Pricing & Packages" section.

### Testimonials
Replace the sample testimonials with real ones (with permission).

### Statistics
Update the counter values to reflect your actual metrics.

## 📱 Features

- ✅ Fully responsive design
- ✅ Mobile-friendly navigation
- ✅ Animated counters and scroll effects
- ✅ FAQ accordion
- ✅ Contact form with validation
- ✅ WhatsApp integration
- ✅ SEO optimized
- ✅ Open Graph meta tags
- ✅ Accessibility features
- ✅ Privacy Policy & Terms pages
- ✅ Custom 404 page
- ✅ Netlify ready with security headers

## 🔧 Deployment

### Netlify (Recommended)
1. Push to GitHub
2. Connect to Netlify
3. Deploy automatically!
4. The `netlify.toml` file handles redirects and security headers

### GitHub Pages
1. Go to Settings > Pages
2. Select main branch
3. Your site will be at `username.github.io/repo-name`

### Vercel
1. Import from GitHub
2. Deploy with default settings

## 📄 Legal

Remember to:
- Update privacy policy with your actual data handling practices
- Customize terms of service for your specific policies
- Ensure POPIA compliance for South African users

## 📞 Support

For technical issues with this website template, please open an issue.

---

© 2026 Project Odysseus. All rights reserved.