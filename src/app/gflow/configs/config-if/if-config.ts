export interface Condition {
  left: string;
  operator: string;
  right: unknown;
  rightIsKey?: boolean;
}

export const createCondition = (): Condition => ({
  left: '',
  operator: '==',
  right: '',
});

export const cloneConditions = (conditions: Condition[]): Condition[] =>
  conditions.map((condition) => ({ ...condition }));

export const IF_OPERATORS = [
  { label: '== égal', value: '==' },
  { label: '!= différent', value: '!=' },
  { label: '> supérieur', value: '>' },
  { label: '>= supérieur ou égal', value: '>=' },
  { label: '< inférieur', value: '<' },
  { label: '<= inférieur ou égal', value: '<=' },
  { label: 'contient', value: 'contains' },
  { label: 'commence par', value: 'startsWith' },
  { label: 'est vide', value: 'isEmpty' },
  { label: 'n’est pas vide', value: 'notEmpty' },
];
