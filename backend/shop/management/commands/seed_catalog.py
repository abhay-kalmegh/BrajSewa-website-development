"""Load the demo catalogue the storefront prototype shipped with.

Safe to run repeatedly: products are matched by slug and updated in place. This is DEMO CONTENT
(copied from the original hardcoded pages, with generic copy for the box-builder items). Replace
names, prices, photos and stock with your real catalogue in the Django admin before launch.
"""
from django.core.management.base import BaseCommand

from shop.models import Product

U = 'https://images.unsplash.com/'
IMG = {
    'mala': U + 'photo-1606293926075-69a00dbfde81?auto=format&fit=crop&w=1000&q=85',
    'counter': U + 'photo-1603006905003-be475563bc59?auto=format&fit=crop&w=1000&q=85',
    'mogra': U + 'photo-1594035910387-fea47794261f?auto=format&fit=crop&w=1000&q=85',
    'jholi': U + 'photo-1604881988758-f76ad2f7aac1?auto=format&fit=crop&w=1000&q=85',
    'chandan': U + 'photo-1604608672516-f1b9e0e0b5ae?auto=format&fit=crop&w=1000&q=85',
    'sandal': U + 'photo-1615634260167-c8cdedd30a1a?auto=format&fit=crop&w=1000&q=85',
    'box': '/braj-seva-hero.webp',  # served from this site's /public
}

# (slug, name, category, price Rs, compare-at Rs, stock, image, badge, description, details, listed)
PRODUCTS = [
    ('tulsi-japa-mala', 'Tulsi Japa Mala', 'Naam Jap', 299, 399, 12, IMG['mala'], 'Bestseller',
     'A serene Tulsi mala for daily naam jap, prayer, and mindful pauses throughout your day.',
     ['108 Tulsi beads plus guru bead', 'Hand-finished for comfortable daily use', 'Keep dry and store in the included cotton pouch'], True),
    ('naam-jap-counter', 'Naam Jap Counter', 'Naam Jap', 299, 349, 8, IMG['counter'], 'Daily essential',
     'A tactile counter to help you keep your practice steady, focused, and peaceful.',
     ['Easy thumb counter', 'Lightweight devotional companion', 'Designed for everyday repetition practice'], True),
    ('mogra-ittar', 'Mogra Ittar', 'Ittar & Sugandh', 249, 299, 16, IMG['mogra'], 'New',
     'A soft floral fragrance that brings a gentle, welcoming atmosphere to your seva space.',
     ['Concentrated roll-on fragrance', 'Use sparingly on pulse points', 'Keep away from direct sunlight'], True),
    ('handmade-mala-jholi', 'Handmade Mala Jholi', 'Naam Jap', 199, 249, 5, IMG['jholi'], 'Handmade',
     'A handmade jholi that keeps your mala protected while you move through your daily practice.',
     ['Soft cotton construction', 'Comfortable shoulder cord', 'Made for one standard mala'], True),
    ('braj-chandan', 'Braj Chandan', 'Pooja Essentials', 149, 199, 24, IMG['chandan'], '',
     'A simple chandan essential for your daily tilak, offering, and prayer routine.',
     ['Smooth sandalwood paste', 'Suitable for daily pooja', 'Store sealed in a cool, dry place'], True),
    ('rose-dhoop-cones', 'Rose Dhoop Cones', 'Incense & Dhoop', 179, 229, 18, IMG['counter'], '',
     'Rose-scented dhoop cones for creating a calm, fragrant devotional atmosphere.',
     ['Slow-burning cones', 'Rose fragrance', 'Use on a heat-safe surface with ventilation'], True),
    ('braj-seva-gift-box', 'Braj Seva Gift Box', 'Seva Boxes', 799, 999, 6, IMG['box'], '',
     'A thoughtful collection of Braj-inspired essentials, packed with care for gifting or seva.',
     ['Curated devotional assortment', 'Gift-ready presentation', 'Packed with care from Braj'], True),
    ('sandal-ittar', 'Sandal Ittar', 'Ittar & Sugandh', 249, 299, 10, IMG['sandal'], '',
     'A warm sandal fragrance for quiet evenings, offerings, and everyday moments of calm.',
     ['Concentrated roll-on fragrance', 'Warm sandalwood profile', 'Keep away from direct sunlight'], True),

    # --- Items used by the home page "build your seva box" feature --------------------------------
    ('kanthi-mala', 'Kanthi Mala', 'Naam Jap', 199, None, 20, IMG['mala'], '',
     'A simple Kanthi mala for daily wear and remembrance.',
     ['Hand-strung beads', 'Comfortable for all-day wear'], True),
    ('yellow-chandan', 'Yellow Chandan', 'Pooja Essentials', 99, None, 20, IMG['chandan'], '',
     'Yellow chandan for daily tilak and offering.', ['Smooth paste', 'Store sealed in a cool, dry place'], True),
    ('red-chandan', 'Red Chandan', 'Pooja Essentials', 99, None, 20, IMG['chandan'], '',
     'Red chandan for daily tilak and offering.', ['Smooth paste', 'Store sealed in a cool, dry place'], True),
    ('braj-raj', 'Braj Raj', 'Braj Seva', 99, None, 20, IMG['chandan'], '',
     'Sacred Braj Raj, a humble connection to the dust of Braj.', ['Carefully packed', 'For offering and tilak'], True),
    ('kapoor', 'Kapoor', 'Pooja Essentials', 99, None, 20, IMG['counter'], '',
     'Camphor for aarti and daily pooja.', ['For aarti and pooja', 'Keep sealed and dry'], True),
    ('dhoop', 'Dhoop', 'Incense & Dhoop', 99, None, 20, IMG['counter'], '',
     'Dhoop for a calm, fragrant devotional atmosphere.', ['Use on a heat-safe surface', 'Ventilate while burning'], True),
    # Packing fee for custom boxes. A real, server-priced SKU, but hidden from shop listings.
    ('seva-box-packing', 'Seva box packing (cotton potli)', 'Seva Boxes', 149, None, 999, IMG['box'], '',
     'Packing for a custom seva box, in a reusable cotton potli.', ['Reusable cotton potli'], False),
]


class Command(BaseCommand):
    help = 'Create or update the demo catalogue (matched by slug). Edit real data in the admin afterwards.'

    def handle(self, *args, **options):
        created = updated = 0
        for order, (slug, name, category, price, compare, stock, image, badge, description, details, listed) in enumerate(PRODUCTS):
            _, was_created = Product.objects.update_or_create(slug=slug, defaults={
                'name': name, 'category': category, 'price_paise': price * 100,
                'compare_at_price_paise': compare * 100 if compare else None, 'inventory': stock,
                'image_url': image, 'badge': badge, 'description': description, 'details': details,
                'listed': listed, 'active': True, 'sort_order': order})
            created += was_created
            updated += not was_created
        self.stdout.write(self.style.SUCCESS(f'Catalogue ready: {created} created, {updated} updated.'))
