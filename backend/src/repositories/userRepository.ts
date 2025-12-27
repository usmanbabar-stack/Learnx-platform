import { Pool } from 'pg';
import { getPostgresPool } from '../config/postgres';
import bcrypt from 'bcryptjs';

export interface User {
  id: number;
  email: string;
  passwordHash: string;
  firstName?: string;
  lastName?: string;
  role: 'student' | 'teacher' | 'admin';
  institution?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserInput {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
  role?: 'student' | 'teacher' | 'admin';
  institution?: string;
}

export class UserRepository {
  private pool: Pool;

  constructor() {
    this.pool = getPostgresPool();
  }

  async findByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = $1';
    const result = await this.pool.query(query, [email]);
    if (result.rows.length === 0) return null;
    
    return this.mapRowToUser(result.rows[0]);
  }

  async findById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    if (result.rows.length === 0) return null;
    
    return this.mapRowToUser(result.rows[0]);
  }

  async create(input: CreateUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 12);
    
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

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return await bcrypt.compare(password, user.passwordHash);
  }

  private mapRowToUser(row: any): User {
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

export const userRepository = new UserRepository();

