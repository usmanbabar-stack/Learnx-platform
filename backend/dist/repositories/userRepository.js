"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.UserRepository = void 0;
const postgres_1 = require("../config/postgres");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
class UserRepository {
    constructor() {
        this.pool = (0, postgres_1.getPostgresPool)();
    }
    async findByEmail(email) {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await this.pool.query(query, [email]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToUser(result.rows[0]);
    }
    async findById(id) {
        const query = 'SELECT * FROM users WHERE id = $1';
        const result = await this.pool.query(query, [id]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToUser(result.rows[0]);
    }
    async create(input) {
        const passwordHash = await bcryptjs_1.default.hash(input.password, 12);
        const query = `
      INSERT INTO users (email, password_hash, first_name, last_name, role, institution)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
        const result = await this.pool.query(query, [
            input.email,
            passwordHash,
            input.firstName || null,
            input.lastName || null,
            input.role || 'student',
            input.institution || null
        ]);
        return this.mapRowToUser(result.rows[0]);
    }
    async verifyPassword(user, password) {
        return await bcryptjs_1.default.compare(password, user.passwordHash);
    }
    mapRowToUser(row) {
        return {
            id: row.id,
            email: row.email,
            passwordHash: row.password_hash,
            firstName: row.first_name,
            lastName: row.last_name,
            role: row.role,
            institution: row.institution,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
exports.UserRepository = UserRepository;
exports.userRepository = new UserRepository();
//# sourceMappingURL=userRepository.js.map