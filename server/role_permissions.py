from flask import Blueprint, request, jsonify
import psycopg2.extras
from .utils.db import get_db_cursor
from .utils.auth_decorator import token_required, roles_required

role_permissions_bp = Blueprint('role_permissions', __name__)

@role_permissions_bp.route('/role-permissions', methods=['GET'])
@token_required
def get_role_permissions():
    cursor = get_db_cursor()
    try:
        cursor.execute("SELECT permissions FROM role_permissions WHERE name = %s LIMIT 1", ('default',))
        row = cursor.fetchone()
        cursor.close()
        if not row or not row.get('permissions'):
            return jsonify({}), 200
        return jsonify(row['permissions']), 200
    except Exception as e:
        try:
            cursor.close()
        except:
            pass
        return jsonify({'error': str(e)}), 500

@role_permissions_bp.route('/role-permissions', methods=['POST'])
@roles_required('Admin')
def save_role_permissions():
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({'error': 'Invalid payload, expected JSON object of permissions'}), 400

    cursor = get_db_cursor()
    try:
        cursor.execute(
            """
            INSERT INTO role_permissions (name, permissions, created_at, updated_at)
            VALUES (%s, %s, now(), now())
            ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now()
            """,
            ('default', psycopg2.extras.Json(data))
        )
        cursor.connection.commit()
        return jsonify({'message': 'Permissions saved'}), 200
    except Exception as e:
        cursor.connection.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        cursor.close()
