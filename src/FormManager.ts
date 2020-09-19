import { DocumentNode } from '@apollo/client';
import _ from 'lodash';
import { getDeepStatus, makeApolloFormQuery, objectDeepPairs } from './utils';
import {
   ApolloFormState,
   FieldValidator,
   FormErrors,
   FormManagerParams,
   FormTouches,
} from './types';
import React from 'react';
import FormManipulator from './FormManipulator';

const defaultState: Omit<ApolloFormState<{}>, 'values'> = {
   errors: {},
   touches: {},
   isValid: true,
   loading: false,
   existsChanges: false,
   isSubmitted: false,
} as const;

class FormManager<S extends object> {
   protected customValidators: { [key: string]: FieldValidator<any> } = {};
   protected apolloClient: FormManagerParams<S>['apolloClient'];
   protected name: FormManagerParams<S>['name'];
   protected validateHandler: FormManagerParams<S>['validate'];
   protected validationSchema: FormManagerParams<S>['validationSchema'];
   protected onSubmit: FormManagerParams<S>['onSubmit'];
   protected onChange: FormManagerParams<S>['onChange'];
   protected resetOnSubmit: FormManagerParams<S>['resetOnSubmit'];
   protected validateOnMount: FormManagerParams<S>['validateOnMount'];
   protected initialState: S;
   protected initialErrors: FormErrors<S>;
   protected initialTouches: FormTouches<S>;
   protected query: DocumentNode;
   public manipulator: FormManipulator<S>;

   constructor(props: FormManagerParams<S>) {
      this.apolloClient = props.apolloClient;
      this.name = props.name;
      this.validateHandler = props.validate;
      this.query = this.getQuery();
      this.onChange = props.onChange;
      this.onSubmit = props.onSubmit;
      this.validationSchema = props.validationSchema;
      this.validateOnMount = props.validateOnMount;
      this.resetOnSubmit = props.resetOnSubmit;
      this.initialState = _.cloneDeep(props.initialState);
      this.initialErrors = _.cloneDeep(props.initialErrors) || {};
      this.initialTouches = _.cloneDeep(props.initialTouches) || {};
      this.manipulator = new FormManipulator({
         ...props,
         defaultState,
         initialTouches: this.initialTouches,
         initialErrors: this.initialErrors,
         customValidators: this.customValidators,
      });

      // for set default
      this.get();

      this.validate(this.validateOnMount);
   }

   public set(state: ApolloFormState<S>) {
      this.apolloClient.writeQuery({ query: this.query, data: { [this.name]: state } });
   }
   public get(): ApolloFormState<S> {
      let data;

      try {
         data = this.apolloClient.readQuery<ApolloFormState<S>>({
            query: this.query,
         }) as any;
      } catch (e) {}

      if (!data) {
         this.set({
            ...defaultState,
            values: this.initialState,
            errors: this.initialErrors,
            touches: this.initialTouches,
         });

         data = this.apolloClient.readQuery<ApolloFormState<S>>({
            query: this.query,
         }) as any;
      }

      return _.cloneDeep(data[this.name]) as ApolloFormState<S>;
   }
   public useState<P = ApolloFormState<S>>(getValue?: (state: ApolloFormState<S>) => P): P {
      const [state, setState] = React.useState(getValue ? getValue(this.get()) : this.get());

      React.useEffect(() => {
         const unWatch = this.apolloClient.cache.watch({
            query: this.getQuery(),
            callback: ({ result }) => {
               const s = (result as { [key: string]: ApolloFormState<S> })[this.name];

               const v = getValue ? getValue(s) : s;

               if (!_.isEqual(state, v)) {
                  setState(v);
               }
            },
            optimistic: false,
         });

         return unWatch;
      }, [getValue, state]);

      return state as P;
   }
   public useValue(key: string) {
      const value = this.useState(state => {
         return this.manipulator.getValue(state, key);
      });

      return value;
   }
   public useTouched(key: string) {
      const value = this.useState(state => {
         return this.manipulator.getTouched(state, key);
      });

      return value;
   }
   public useError(key: string) {
      const value = this.useState(state => {
         return this.manipulator.getError(state, key);
      });

      return value;
   }

   public setValues(values: S) {
      this.set({ ...this.get(), values });

      if (this.onChange) {
         this.onChange(values, this);
      }
   }
   public setErrors(errors: FormErrors<S>) {
      return this.set({ ...this.get(), errors });
   }
   public setTouches(touches: FormTouches<S>) {
      return this.set({ ...this.get(), touches });
   }

   public setFieldValue(key: string, newValue: any) {
      const state = this.get();
      const touched = getDeepStatus(state.touches, key);

      if (!touched) {
         this.manipulator.setTouched(state, key, true);
      }

      this.manipulator.setValue(state, key, newValue);

      this.manipulator.validate(state, false);

      this.set(state);

      if (this.onChange) {
         this.onChange(state.values, this);
      }

      return state;
   }
   public setFieldError(key: string, error: string | undefined) {
      const state = this.get();

      this.manipulator.setError(state, key, error);

      const errorsPairs = objectDeepPairs(state.errors);
      const nextIsValid = Boolean(errorsPairs.find(el => Boolean(el[1])));

      state.isValid = nextIsValid;

      return this.set(state);
   }
   public setFieldTouched(key: string, value: boolean) {
      const state = this.get();

      this.manipulator.setTouched(state, key, value);

      return this.set(state);
   }

   public setIsValid(value: boolean) {
      const state = this.get();

      state.isValid = value;

      return this.set(state);
   }
   public setIsSubmitted(value: boolean) {
      const state = this.get();

      state.isSubmitted = value;

      return this.set(state);
   }
   public setExistsChanges(value: boolean) {
      const state = this.get();

      state.existsChanges = value;

      return this.set(state);
   }
   public setLoading(value: boolean) {
      const state = this.get();

      state.loading = value;

      return this.set(state);
   }

   public validate(allTouched?: boolean) {
      const state = this.get();

      this.manipulator.validate(state, allTouched);

      this.set(state);
   }

   public addFieldValidator<Value>(key: string, func: FieldValidator<Value>) {
      if (!this.customValidators[key]) {
         this.customValidators[key] = func;
      }
   }
   public removeFieldValidator(key: string) {
      delete this.customValidators[key];
   }

   public submit() {
      const state = this.get();
      this.manipulator.validate(state, true);

      state.isSubmitted = true;

      if (this.onSubmit && state.isValid) {
         state.loading = true;

         this.set(state);

         this.onSubmit(state, this)
            .then(() => {
               state.loading = false;

               if (this.resetOnSubmit) {
                  this.manipulator.reset(state);
               }

               this.set(state);
            })
            .catch(() => {
               state.loading = false;

               this.set(state);
            });
      } else {
         this.set(state);
      }
   }

   public reset(getState?: S | ((state: S) => S)) {
      const state = this.get();

      this.manipulator.reset(state, getState);

      this.manipulator.validate(state, this.validateOnMount);

      state.isSubmitted = false;
      state.existsChanges = false;

      this.set(state);
   }

   public getQuery() {
      return makeApolloFormQuery(this.name);
   }
}

export default FormManager;
