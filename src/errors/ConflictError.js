import { AppError } from './AppError.js';

export class ConflictError extends AppError {
    constructor(message = 'Конфликт данных', code = 'CONFLICT') {
        super(message, { status: 409, code });
    }
}