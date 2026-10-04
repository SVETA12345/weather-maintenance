// Модульные тесты бизнес-логики: правила выполняются без базы, HTTP и репозиториев.
// Всё проверяемое вынесено в src/services/requestRules.js, поэтому тесты не зависят
// от состояния PostgreSQL и выполняются за миллисекунды.
import {
    ASSIGNEE_REQUIRED_CODE,
    NO_CREW_MESSAGE,
    NO_LAST_ASSIGNEE_MESSAGE,
    NOT_ASSIGNED_MESSAGE,
    STATUS_TRANSITIONS,
    assertAssigneeRemovable,
    assertCanChangeStatus,
    assertCrewAssigned,
    assertTransitionAllowed,
    isTransitionAllowed,
    validateCrew,
} from '../../src/services/requestRules.js';

const technicianId = '11111111-1111-4111-8111-111111111111';
const otherTechnicianId = '22222222-2222-4222-8222-222222222222';

const request = (status, assignees = []) => ({
    id: '33333333-3333-4333-8333-333333333333',
    status,
    assignees,
});

const crewMember = (id, role = 'member') => ({ technicianId: id, role });

const actor = (role, assignedTechnicianId = null) => ({
    id: '44444444-4444-4444-8444-444444444444',
    role,
    technicianId: assignedTechnicianId,
});

describe('Допустимость переходов статусов', () => {
    test.each([
        ['new', 'in_progress', true],
        ['new', 'rejected', true],
        ['in_progress', 'done', true],
        ['in_progress', 'rejected', true],
        ['new', 'done', false],
        ['done', 'in_progress', false],
        ['done', 'rejected', false],
        ['rejected', 'done', false],
        ['rejected', 'new', false],
    ])('%s → %s допустим: %s', (from, to, expected) => {
        expect(isTransitionAllowed(from, to)).toBe(expected);
    });

    test('из terminal-статусов переходов нет', () => {
        expect(STATUS_TRANSITIONS.done).toEqual([]);
        expect(STATUS_TRANSITIONS.rejected).toEqual([]);
    });

    test('неизвестный статус не допускает ни одного перехода', () => {
        expect(isTransitionAllowed('archived', 'done')).toBe(false);
    });

    test('assertTransitionAllowed пропускает разрешённый переход', () => {
        expect(() => assertTransitionAllowed(request('new'), 'in_progress')).not.toThrow();
    });

    test('assertTransitionAllowed отклоняет запрещённый переход с кодом INVALID_STATUS_TRANSITION', () => {
        expect.assertions(3);
        try {
            assertTransitionAllowed(request('new', [crewMember(technicianId, 'lead')]), 'done');
        } catch (error) {
            expect(error.status).toBe(409);
            expect(error.code).toBe('INVALID_STATUS_TRANSITION');
            expect(error.message).toContain('new → done');
        }
    });

    test('в in_progress нельзя перевести заявку без исполнителей', () => {
        expect.assertions(3);
        try {
            assertCrewAssigned(request('new', []));
        } catch (error) {
            expect(error.status).toBe(409);
            expect(error.code).toBe(ASSIGNEE_REQUIRED_CODE);
            expect(error.message).toBe(NO_CREW_MESSAGE);
        }
    });

    test('с назначенной бригадой перевод в in_progress разрешён', () => {
        expect(() => assertCrewAssigned(request('new', [crewMember(technicianId, 'lead')]))).not.toThrow();
    });
});

describe('Правила назначения бригады', () => {
    test('ровно один lead — валидная бригада', () => {
        expect(() =>
            validateCrew([crewMember(technicianId, 'lead'), crewMember(otherTechnicianId, 'member')]),
        ).not.toThrow();
    });

    test('бригада без lead отклоняется с 422', () => {
        expect.assertions(4);
        try {
            validateCrew([crewMember(technicianId, 'member'), crewMember(otherTechnicianId, 'member')]);
        } catch (error) {
            expect(error.status).toBe(422);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.details[0].field).toBe('role');
            expect(error.details[0].message).toContain('передано: 0');
        }
    });

    test('два lead отклоняются: сообщение сообщает их количество', () => {
        expect.assertions(2);
        try {
            validateCrew([crewMember(technicianId, 'lead'), crewMember(otherTechnicianId, 'lead')]);
        } catch (error) {
            expect(error.status).toBe(422);
            expect(error.details[0].message).toContain('передано: 2');
        }
    });

    test('пустая бригада отклоняется', () => {
        expect(() => validateCrew([])).toThrow();
    });

    test('последнего исполнителя нельзя снять с заявки в работе', () => {
        expect.assertions(3);
        try {
            assertAssigneeRemovable(request('in_progress', [crewMember(technicianId, 'lead')]), technicianId);
        } catch (error) {
            expect(error.status).toBe(409);
            expect(error.code).toBe(ASSIGNEE_REQUIRED_CODE);
            expect(error.message).toBe(NO_LAST_ASSIGNEE_MESSAGE);
        }
    });

    test('последнего исполнителя можно снять, если заявка не в работе', () => {
        expect(() =>
            assertAssigneeRemovable(request('new', [crewMember(technicianId, 'lead')]), technicianId),
        ).not.toThrow();
    });

    test('не последнего исполнителя можно снять с заявки в работе', () => {
        expect(() =>
            assertAssigneeRemovable(
                request('in_progress', [crewMember(technicianId, 'lead'), crewMember(otherTechnicianId, 'member')]),
                otherTechnicianId,
            ),
        ).not.toThrow();
    });
});

describe('Права ролей на смену статуса', () => {
    test('admin может менять статус любой заявки', () => {
        expect(() => assertCanChangeStatus(actor('admin'), request('new'))).not.toThrow();
    });

    test('viewer не может менять статус: 403 ROLE_REQUIRED', () => {
        expect.assertions(3);
        try {
            assertCanChangeStatus(actor('viewer'), request('new', [crewMember(technicianId, 'lead')]));
        } catch (error) {
            expect(error.status).toBe(403);
            expect(error.code).toBe('ROLE_REQUIRED');
            expect(error.message).toContain('viewer');
        }
    });

    test('technician может менять статус заявки, на которой он назначен', () => {
        expect(() =>
            assertCanChangeStatus(
                actor('technician', technicianId),
                request('new', [crewMember(technicianId, 'lead'), crewMember(otherTechnicianId, 'member')]),
            ),
        ).not.toThrow();
    });

    test('technician не может менять статус чужой заявки: 403 NOT_ASSIGNED', () => {
        expect.assertions(3);
        try {
            assertCanChangeStatus(
                actor('technician', technicianId),
                request('new', [crewMember(otherTechnicianId, 'lead')]),
            );
        } catch (error) {
            expect(error.status).toBe(403);
            expect(error.code).toBe('NOT_ASSIGNED');
            expect(error.message).toBe(NOT_ASSIGNED_MESSAGE);
        }
    });

    test('technician без technicianId не проходит даже в своей бригаде', () => {
        expect(() => assertCanChangeStatus(actor('technician', null), request('new', []))).toThrow();
    });
});