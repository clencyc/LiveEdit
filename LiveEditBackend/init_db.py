#!/usr/bin/env python3
"""Initialize database with audio effects table and seed data"""

import psycopg2
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

def init_database():
    """Create tables and insert initial audio effects"""
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Create audio_effects table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS audio_effects (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            filename VARCHAR(255) NOT NULL UNIQUE,
            category VARCHAR(100),
            description TEXT,
            duration_seconds FLOAT,
            tags TEXT[],
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    
    # Insert initial effects
    effects = [
        (
            'News Stinger',
            'bbc_newspapers_07065098.mp3',
            'transition',
            'Professional news transition sound. Use for scene changes or important announcements.',
            None,
            ['news', 'transition', 'professional', 'stinger']
        ),
        (
            'Electronic Pulse',
            'bbc_electronic_07065086.mp3',
            'effect',
            'Sharp electronic pulse. Good for quick cuts, reveals, or tech-themed moments.',
            None,
            ['electronic', 'pulse', 'tech', 'quick', 'reveal']
        )
    ]
    
    for effect in effects:
        cur.execute("""
            INSERT INTO audio_effects (name, filename, category, description, duration_seconds, tags)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (filename) DO UPDATE
            SET name = EXCLUDED.name,
                category = EXCLUDED.category,
                description = EXCLUDED.description,
                tags = EXCLUDED.tags;
        """, effect)
    
    conn.commit()
    cur.close()
    conn.close()
    print("✓ Database initialized successfully")
    print("✓ Audio effects table created")
    print(f"✓ Inserted {len(effects)} audio effects")

if __name__ == '__main__':
    init_database()
