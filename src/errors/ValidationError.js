import { AppError } from './AppError.js';

export class ValidationError extends AppError {
    constructor(details, message = 'Некорректные данные запроса') {
        super(message, { status: 422, code: 'VALIDATION_ERROR', details });
    }
}