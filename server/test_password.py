import bcrypt

stored_hash = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewYpfQN4fGPM/0zO"
test_password = "changeme123"

result = bcrypt.checkpw(
    test_password.encode('utf-8'),
    stored_hash.encode('utf-8')
)

print(f"Password matches: {result}")

# Let's also generate a new hash for the same password to compare
new_hash = bcrypt.hashpw(test_password.encode('utf-8'), bcrypt.gensalt())
print(f"\nStored hash: {stored_hash}")
print(f"New hash:    {new_hash.decode('utf-8')}")
