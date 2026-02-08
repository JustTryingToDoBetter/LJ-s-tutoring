(function () {
  'use strict';

  if (typeof document === 'undefined') {return;}

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': 'Project Odysseus Maths Tutoring Cape Town',
    'description': 'Private maths tutoring for Grade 8-12 students in Cape Town. CAPS curriculum specialists.',
    'url': 'https://projectodysseus.live/maths-tutoring-cape-town.html',
    'telephone': '+27679327754',
    'email': 'projectodysseus10@gmail.com',
    'priceRange': 'R180-R250/hour',
    'address': {
      '@type': 'PostalAddress',
      'addressLocality': 'Cape Town',
      'addressRegion': 'Western Cape',
      'addressCountry': 'ZA',
    },
    'geo': {
      '@type': 'GeoCoordinates',
      'latitude': '-33.9249',
      'longitude': '18.4241',
    },
    'openingHoursSpecification': [
      {
        '@type': 'OpeningHoursSpecification',
        'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
        'opens': '17:00',
        'closes': '20:00',
      },
    ],
  };

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
})();
