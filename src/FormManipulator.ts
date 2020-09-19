import {
   ApolloFormState,
   FieldValidator,
   FormErrors,
   FormManagerParams,
   FormTouches,
} from './types';
import _ from 'lodash';
import { getDeepStatus, objectDeepPairs, setDeepStatus } from './utils';

class FormManipulator<S extends object> {
   protected validateHandler: FormManagerParams<S>['validate'];
   protected validationSchema: FormManagerParams<S>['validationSchema'];
   protected customValidators: { [key: string]: FieldValidator<any> };
   protected initialState: S;
   protected initialErrors: FormErrors<S>;
   protected initialTouches: FormTouches<S>;
   protected validateOnMount: FormManagerParams<S>['validateOnMount'];
   protected defaultState: Omit<ApolloFormState<S>, 'values'>;

   constructor(
      props: Omit<FormManagerParams<S>, 'initialErrors' | 'initialTouches'> &
         Required<Pick<FormManagerParams<S>, 'initialErrors' | 'initialTouches'>> & {
            customValidators: { [key: string]: FieldValidator<any> };
            defaultState: Omit<ApolloFormState<S>, 'values'>;
         },
   ) {
      this.validateHandler = props.validate;
      this.validationSchema = props.validationSchema;
      this.customValidators = props.customValidators;
      this.initialState = props.initialState;
      this.initialErrors = props.initialErrors;
      this.initialTouches = props.initialTouches;
      this.validateOnMount = props.validateOnMount;
      this.defaultState = props.defaultState;
   }

   public setValue(state: ApolloFormState<S>, key: string, newValue: any): ApolloFormState<S> {
      const value = _.get(state.values, key);

      if (!_.isEqual(value, newValue)) {
         _.set(state.values, key, newValue);
      }

      if (!state.existsChanges) {
         state.existsChanges = true;
      }

      return state;
   }
   public setError(
      state: ApolloFormState<S>,
      key: string,
      value: string | undefined,
   ): ApolloFormState<S> {
      const error = getDeepStatus(state.errors, key);

      if (error !== value) {
         setDeepStatus(state.errors, key, value);
      }

      return state;
   }
   public setTouched(state: ApolloFormState<S>, key: string, value: boolean): ApolloFormState<S> {
      const touched = getDeepStatus(state.touches, key);

      if (touched !== value) {
         setDeepStatus(state.touches, key, value);
      }

      return state;
   }
   public getValue(state: ApolloFormState<S>, key: string) {
      return _.get(state.values, key);
   }
   public getError(state: ApolloFormState<S>, key: string) {
      return getDeepStatus(_.cloneDeep(state.errors), key);
   }
   public getTouched(state: ApolloFormState<S>, key: string) {
      return getDeepStatus(_.cloneDeep(state.touches), key);
   }
   public validate(state: ApolloFormState<S>, allTouched: boolean = false): ApolloFormState<S> {
      state.errors = {};

      // merge errors from validate func
      if (this.validateHandler) {
         const customErrors = this.validateHandler(state);

         _.merge(state.errors, customErrors);
      }

      // custom validators
      for (const key in this.customValidators) {
         if (!(key in state.errors)) {
            const value = _.get(state.values, key);
            const newError = this.customValidators[key](value);

            if (newError) {
               this.setError(state, key, newError);
            }
         }
      }

      // yup validate
      if (this.validationSchema) {
         try {
            this.validationSchema.validateSync(state.values, {
               recursive: true,
               abortEarly: false,
            });
         } catch (e) {
            for (const err of e.inner) {
               const path = err.path.replace('[', '.').replace(']', '');
               this.setError(state, path, err.message);
            }
         }
      }

      const errorsPairs = objectDeepPairs(state.errors);

      const nextIsValid = !Boolean(errorsPairs.find(el => Boolean(el[1])));

      if (allTouched) {
         for (const pair of errorsPairs) {
            _.set(state.touches, pair[0], true);
         }
      }

      state.isValid = nextIsValid;

      return state;
   }

   public reset(state: ApolloFormState<S>, getState?: S | ((state: S) => S)) {
      if (getState) {
         if (typeof getState === 'function') {
            Object.assign(state, {
               ...this.defaultState,
               values: (getState as (state: S) => S)(state.values),
               errors: this.initialErrors,
               touches: this.initialTouches,
            });
         } else {
            Object.assign(state, {
               ...this.defaultState,
               values: getState,
               errors: this.initialErrors,
               touches: this.initialTouches,
            });
         }
      } else {
         Object.assign(state, {
            ...this.defaultState,
            values: this.initialState,
            errors: this.initialErrors,
            touches: this.initialTouches,
         });
      }

      return state;
   }
}

export default FormManipulator;
