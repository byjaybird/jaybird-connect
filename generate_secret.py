import secrets

# Generate a 32-byte (256-bit) random string and convert it to hex
secret = secrets.token_hex(32)
print(f"Your JWT_SECRET should be: {secret}")