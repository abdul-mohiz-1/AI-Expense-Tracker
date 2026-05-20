import sqlite3
import glob
import os

# Backend folder ya instance folder mein .db file dhoondna
db_files = glob.glob('*.db') + glob.glob('instance/*.db') + glob.glob('database/*.db')

if not db_files:
    print("❌ Database file nahi mili! Check karein ke database kahan save hai.")
else:
    # Pehli .db file ko select karein
    db_path = db_files[0]
    print(f"✅ Database mil gayi: {db_path}")
    
    # Direct database se connect karein
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Transactions table ka saara data delete kar dein
        cursor.execute("DELETE FROM transactions;")
        conn.commit()
        print("🎉 Mubarak ho! Saara purana test data delete ho gaya hai. Ab dashboard fresh hai!")
    except Exception as e:
        print(f"❌ Error aaya: {e}")
    finally:
        conn.close()