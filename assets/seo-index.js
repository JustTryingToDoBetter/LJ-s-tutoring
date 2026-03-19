(function () {
  'use strict';

  if (typeof document === 'undefined') {return;}

  const schemas = [
    {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      'name': 'Project Odysseus',
      'alternateName': 'Project Odysseus Maths Tutoring',
      'description': 'Top-rated Mathematics tutoring for Grade 8-12 students in Cape Town and South Africa. CAPS curriculum specialists with proven results.',
      'url': 'https://projectodysseus.live',
      'logo': 'https://projectodysseus.live/favicon.svg',
      'email': 'projectodysseus10@gmail.com',
      'telephone': '+27679327754',
      'foundingDate': '2024',
      'areaServed': [
        { '@type': 'City', 'name': 'Cape Town' },
        { '@type': 'Country', 'name': 'South Africa' },
      ],
      'serviceType': ['Mathematics Tutoring', 'Exam Preparation', 'CAPS Curriculum Support'],
      'hasOfferCatalog': {
        '@type': 'OfferCatalog',
        'name': 'Maths Tutoring Packages',
        'itemListElement': [
          {
            '@type': 'Offer',
            'name': 'Flexi-Hour',
            'price': '200',
            'priceCurrency': 'ZAR',
            'description': 'Pay as you go maths tutoring - R200 per hour',
          },
          {
            '@type': 'Offer',
            'name': '5-Hour Tune Up',
            'price': '900',
            'priceCurrency': 'ZAR',
            'description': '5 hours of maths tutoring - R190 per hour effective rate',
          },
          {
            '@type': 'Offer',
            'name': '10-Hour Distinction',
            'price': '1700',
            'priceCurrency': 'ZAR',
            'description': '10 hours of maths tutoring - R180 per hour effective rate',
          },
        ],
      },
      'founder': [
        {
          '@type': 'Person',
          'name': 'Liam Newton',
          'jobTitle': 'Co-Founder & Maths Tutor',
          'alumniOf': 'Stellenbosch University',
        },
        {
          '@type': 'Person',
          'name': 'Jaydin Morrison',
          'jobTitle': 'Co-Founder & Maths Tutor',
          'alumniOf': 'University of the Western Cape',
        },
      ],
      'aggregateRating': {
        '@type': 'AggregateRating',
        'ratingValue': '4.9',
        'bestRating': '5',
        'worstRating': '1',
        'ratingCount': '47',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'LocalBusiness',
      '@id': 'https://projectodysseus.live/#business',
      'name': 'Project Odysseus Maths Tutoring',
      'image': 'https://projectodysseus.live/og-image.jpg',
      'priceRange': 'R170-R200/hour',
      'openingHoursSpecification': [
        {
          '@type': 'OpeningHoursSpecification',
          'dayOfWeek': ['Monday', 'Tuesday', 'Wednesday', 'Thursday'],
          'opens': '17:00',
          'closes': '20:00',
        },
        {
          '@type': 'OpeningHoursSpecification',
          'dayOfWeek': ['Saturday'],
          'opens': '09:00',
          'closes': '14:00',
        },
      ],
      'telephone': '+27679327754',
      'email': 'projectodysseus.math@gmail.com',
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
      'url': 'https://projectodysseus.live',
      'sameAs': [],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      'mainEntity': [
        {
          '@type': 'Question',
          'name': 'How much does maths tutoring cost in South Africa?',
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': 'Project Odysseus offers maths tutoring from R180-R250 per hour depending on the package. Single sessions are R200/hour, 5-hour packages are R900 (R180/hour), and 10-hour packages are R1700 (R170/hour).',
          },
        },
        {
          '@type': 'Question',
          'name': 'What grades do you tutor for maths?',
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': 'We tutor Mathematics for Grade 8, 9, 10, 11, and 12 students following the CAPS curriculum. We specialise in matric exam preparation and helping students improve their marks.',
          },
        },
        {
          '@type': 'Question',
          'name': 'Do you offer online maths tutoring?',
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': "We primarily focus on in-person tutoring for the best results, but we do offer online sessions via Zoom or Google Meet for package holders who occasionally can't meet in person. Contact us to discuss your needs.",
          },
        },
        {
          '@type': 'Question',
          'name': 'How can maths tutoring help my child pass matric?',
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': "Our personalised 1-on-1 maths tutoring identifies your child's specific weak areas, builds understanding from the ground up, and provides exam strategies. 95% of our students see significant grade improvement.",
          },
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      'serviceType': 'Mathematics Tutoring',
      'provider': {
        '@type': 'EducationalOrganization',
        'name': 'Project Odysseus',
      },
      'areaServed': {
        '@type': 'City',
        'name': 'Cape Town',
      },
      'hasOfferCatalog': {
        '@type': 'OfferCatalog',
        'name': 'Tutoring Services',
        'itemListElement': [
          {
            '@type': 'OfferCatalog',
            'name': 'Grade 8-9 Maths Tutoring',
            'description': 'Foundation phase maths tutoring covering algebra, geometry, and problem-solving skills',
          },
          {
            '@type': 'OfferCatalog',
            'name': 'Grade 10-11 Maths Tutoring',
            'description': 'Intermediate maths tutoring covering functions, trigonometry, and calculus introduction',
          },
          {
            '@type': 'OfferCatalog',
            'name': 'Matric Maths Tutoring',
            'description': 'Grade 12 maths tutoring and exam preparation for NSC finals',
          },
        ],
      },
    },
  ];

  schemas.forEach(function (schema) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(schema);
    document.head.appendChild(script);
  });
})();
