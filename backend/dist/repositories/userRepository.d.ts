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
export declare class UserRepository {
    private pool;
    constructor();
    findByEmail(email: string): Promise<User | null>;
    findById(id: number): Promise<User | null>;
    create(input: CreateUserInput): Promise<User>;
    verifyPassword(user: User, password: string): Promise<boolean>;
    private mapRowToUser;
}
export declare const userRepository: UserRepository;
//# sourceMappingURL=userRepository.d.ts.map