/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: true,
  },
  async redirects() {
    return [
      { source: '/privacy.html', destination: '/privacy', permanent: true },
      { source: '/terms.html', destination: '/terms', permanent: true },
      { source: '/tutor-dashboard.html', destination: '/tutor/dashboard', permanent: true },
      { source: '/maths-tutoring-cape-town.html', destination: '/', permanent: true },
      { source: '/guides/matric-maths-mistakes-guide.html', destination: '/guides/matric-maths-mistakes-guide', permanent: true },
      { source: '/dashboard/index.html', destination: '/dashboard', permanent: true },
      { source: '/dashboard/community/index.html', destination: '/community', permanent: true },
      { source: '/dashboard/career/index.html', destination: '/dashboard', permanent: true },
      { source: '/reports/index.html', destination: '/reports', permanent: true },
      { source: '/reports/view/index.html', destination: '/reports', permanent: true },
      { source: '/tutor/index.html', destination: '/tutor/dashboard', permanent: true },
      { source: '/tutor/reports/index.html', destination: '/tutor/reports', permanent: true },
      { source: '/tutor/risk/index.html', destination: '/tutor/risk', permanent: true },
      { source: '/admin/index.html', destination: '/admin', permanent: true },
      { source: '/admin/:section.html', destination: '/admin/:section', permanent: true },
      { source: '/404.html', destination: '/', permanent: false },
    ];
  },
};

export default nextConfig;
