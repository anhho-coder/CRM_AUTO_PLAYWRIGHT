/**
 * Salesperson -> Sales Team reference list.
 *
 * Test data for lead/opportunity assignment & conversion tests (e.g. the
 * "Assign this opportunity to" UC-A.4.3 cases): pick a Salesperson together with their Sales Team.
 */
export interface SalesTeamUser {
  email: string;
  displayName: string;
  team: string;
}

export const salesTeamUsers = {
  sale_ic_bdeu_thomas: {
    email: 'thomas.semerich@nakivo.com',
    displayName: 'Thomas Semerich',
    team: 'BDEU',
  },
  sale_ic_eam_bilal: {
    email: 'bilal.saab@nakivo.com',
    displayName: 'Bilal Saab',
    team: 'EAM',
  },
  sale_ic_ibsa_timo: {
    email: 'timo.tran@nakivo.com',
    displayName: 'Timo Tran',
    team: 'IBSA',
  },
  sale_ic_cmr_karachin: {
    email: 'sergey.karachin@nakivo.com',
    displayName: 'Sergey Karachin',
    team: 'CMR',
  },
  sale_ic_marketing_bdeu_stiblin: {
    email: 'sergey.stiblin@nakivo.com',
    displayName: 'Sergey Stiblin',
    team: 'Marketing - BDEU',
  },
} as const;
