const Ajv = require('ajv/dist/2020').default;
const schema = require('../schemas/question-bank.schema.json');
const ajv = new Ajv({ strict: false, allErrors: true });
const validate = ajv.compile(schema);
console.log('compiled ok');

const goodCode = {
  name: 'demo',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'code',
      title: 't',
      content: '',
      category: 'c',
      tags: [],
      difficulty: 'easy',
      answer: '',
      language: 'js',
      referenceCode: 'console.log(1)',
    },
  ],
};
console.log('positive code:', validate(goodCode), validate.errors ?? null);

const goodQa = {
  name: 'demo',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'qa',
      title: 't',
      content: '',
      category: 'c',
      tags: [],
      difficulty: 'easy',
      answer: '',
      briefAnswer: 'short',
    },
  ],
};
console.log('positive qa:', validate(goodQa), validate.errors ?? null);

const crossType = {
  name: 'demo',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'code',
      title: 't',
      content: '',
      category: 'c',
      tags: [],
      difficulty: 'easy',
      answer: '',
      briefAnswer: 'should not be here on a code question',
    },
  ],
};
console.log(
  'negative cross-type:',
  validate(crossType),
  'errs:',
  validate.errors?.map((e) => `${e.instancePath} ${e.keyword}`).slice(0, 5)
);

const missingRequired = {
  name: 'demo',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'qa',
      title: 't',
      content: '',
      category: 'c',
      tags: [],
      difficulty: 'easy',
    },
  ],
};
console.log(
  'negative missing required:',
  validate(missingRequired),
  'errs:',
  validate.errors?.map((e) => `${e.instancePath} ${e.keyword}`).slice(0, 5)
);

const badEnum = {
  name: 'demo',
  version: '1.0.0',
  questions: [
    {
      id: 'q1',
      type: 'code',
      title: 't',
      content: '',
      category: 'c',
      tags: [],
      difficulty: 'extreme',
      answer: '',
    },
  ],
};
console.log(
  'negative bad difficulty:',
  validate(badEnum),
  'errs:',
  validate.errors?.map((e) => `${e.instancePath} ${e.keyword}`).slice(0, 5)
);
