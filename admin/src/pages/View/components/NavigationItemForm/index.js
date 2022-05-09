import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { debounce, find, get, first, isEmpty, isEqual, isNil, isString } from 'lodash';
import PropTypes from 'prop-types';
import { Formik } from 'formik'
import slugify from 'slugify';

// Design System
import { ModalBody } from '@strapi/design-system/ModalLayout';
import { Select, Option } from '@strapi/design-system/Select';
import { Grid, GridItem } from '@strapi/design-system/Grid';
import { Form, GenericInput } from '@strapi/helper-plugin';
import { Button } from '@strapi/design-system/Button';

import { NavigationItemPopupFooter } from '../NavigationItemPopup/NavigationItemPopupFooter';
import { navigationItemAdditionalFields, navigationItemType } from '../../utils/enums';
import { extractRelatedItemLabel } from '../../utils/parsers';
import { form as formDefinition } from './utils/form';
import { checkFormValidity } from '../../utils/form';
import { getTradId } from '../../../../translations';
import { getMessage, ResourceState } from '../../../../utils';

const appendLabelPublicationStatusFallback = () => ''

const NavigationItemForm = ({
  config,
  availableLocale,
  isLoading: isPreloading,
  inputsPrefix,
  data = {},
  contentTypes = [],
  contentTypeEntities = [],
  usedContentTypeEntities = [],
  availableAudience = [],
  additionalFields = [],
  contentTypesNameFields = {},
  onSubmit,
  onCancel,
  getContentTypeEntities,
  usedContentTypesData,
  appendLabelPublicationStatus = appendLabelPublicationStatusFallback, 
  locale,
  readNavigationItemFromLocale,
}) => {
  const [isLoading, setIsLoading] = useState(isLoading);
  const [hasBeenInitialized, setInitializedState] = useState(false);
  const [hasChanged, setChangedState] = useState(false);
  const [contentTypeSearchQuery, setContentTypeSearchQuery] = useState(undefined);
  const [contentTypeSearchInputValue, setContentTypeSearchInputValue] = useState(undefined);
  const [form, setFormState] = useState({});
  const [formErrors, setFormErrorsState] = useState({});
  const { relatedType } = form;
  const isI18nBootstrapAvailable = !!(config.i18nEnabled && availableLocale && availableLocale.length);
  const availableLocaleOptions = useMemo(() => availableLocale.map((locale) => ({
    value: locale,
    label: locale,
    metadatas: {
      intlLabel: {
        id: `i18n.locale.${locale}`,
        defaultMessage: locale,
      }
    },
  })), [availableLocale]);

  const relatedFieldName = `${inputsPrefix}related`;

  if (!hasBeenInitialized && !isEmpty(data)) {
    setInitializedState(true);
    setFormState({
      ...data,
      type: data.type || navigationItemType.INTERNAL,
      related: data.related?.value,
      relatedType: data.relatedType?.value,
      audience: data.audience?.map(item => item.id),
    });
  }

  const audience = get(form, `${inputsPrefix}audience`, []);
  const audienceOptions = availableAudience.map((item) => ({
    value: get(item, 'id', " "),
    label: get(item, 'name', " "),
  }));

  const generatePreviewPath = () => {
    if (!isExternal) {
      const value = `${data.levelPath !== '/' ? `${data.levelPath}` : ''}/${form.path !== '/' ? form.path || '' : ''}`;
      return {
        id: getTradId('popup.item.form.type.external.description'),
        defaultMessage: '',
        values: { value }
      }
    }
    return null;
  };

  const sanitizePayload = (payload = {}) => {
    const { onItemClick, onItemLevelAddClick, related, relatedType, menuAttached, type, ...purePayload } = payload;
    const relatedId = related;
    const singleRelatedItem = isSingleSelected ? first(contentTypeEntities) : undefined;
    const relatedCollectionType = relatedType;
    const title = payload.title;

    return {
      ...purePayload,
      title,
      type,
      menuAttached: isNil(menuAttached) ? false : menuAttached,
      path: type !== navigationItemType.EXTERNAL ? purePayload.path : undefined,
      externalPath: type === navigationItemType.EXTERNAL ? purePayload.externalPath : undefined,
      related: type === navigationItemType.INTERNAL ? relatedId : undefined,
      relatedType: type === navigationItemType.INTERNAL ? relatedCollectionType : undefined,
      isSingle: isSingleSelected,
      singleRelatedItem,
      uiRouterKey: generateUiRouterKey(title, relatedId, relatedCollectionType),
    };
  };

  const handleSubmit = async e => {
    if (e) {
      e.preventDefault();
    }

    const payload = sanitizePayload(form);
    const errors = await checkFormValidity(payload, formDefinition.schema(isSingleSelected));
    if (!errors || isEmpty(errors)) {
      return onSubmit(payload);
    } else {
      setFormErrorsState(errors);
    }
  };

  const onAudienceChange = (value) => {
    onChange({ target: { name: `${inputsPrefix}audience`, value } });
  }

  const onChange = ({ target: { name, value } }) => {
    setFormState(prevState => ({
      ...prevState,
      updated: true,
      [name]: value,
    }));
    if (!hasChanged) {
      setChangedState(true);
    }
  };

  const generateUiRouterKey = (title, related, relatedType) => {
    if (title) {
      return isString(title) && !isEmpty(title) ? slugify(title).toLowerCase() : undefined;
    } else if (related) {
      const relationTitle = extractRelatedItemLabel({
        ...contentTypeEntities.find(_ => _.id === related),
        __collectionUid: relatedType
      }, contentTypesNameFields, { contentTypes });
      return isString(relationTitle) && !isEmpty(relationTitle) ? slugify(relationTitle).toLowerCase() : undefined;
    }
    return undefined;
  };

  const initialRelatedTypeSelected = data?.relatedType?.value;
  const relatedTypeSelectValue = form.relatedType;
  const relatedSelectValue = form.related;

  const isSingleSelected = useMemo(
    () => relatedTypeSelectValue ? contentTypes.find(_ => _.uid === relatedTypeSelectValue)?.isSingle || false : false,
    [relatedTypeSelectValue, contentTypes],
  );

  const navigationItemTypeOptions = Object.keys(navigationItemType).map(key => {
    const value = navigationItemType[key].toLowerCase();
    return {
      key,
      value: navigationItemType[key],
      metadatas: {
        intlLabel: {
          id: getTradId(`popup.item.form.type.${value}.label`),
          defaultMessage: getTradId(`popup.item.form.type.${value}.label`),
        }
      }
    }
  });

  // TODO?: useMemo
  const relatedSelectOptions = contentTypeEntities
    .filter((item) => {
      const usedContentTypeEntitiesOfSameType = usedContentTypeEntities
        .filter(uctItem => relatedTypeSelectValue === uctItem.__collectionUid);
      return !find(usedContentTypeEntitiesOfSameType, uctItem => (item.id === uctItem.id && uctItem.id !== form.related));
    })
    .map((item) => {
      const label = appendLabelPublicationStatus(
        extractRelatedItemLabel({
          ...item,
          __collectionUid: get(relatedTypeSelectValue, 'value', relatedTypeSelectValue),
        }, contentTypesNameFields, { contentTypes }),
        item
      );
      return ({
        key: get(item, 'id'),
        metadatas: {
          intlLabel: {
            id: label || `${item.__collectionUid} ${item.id}`,
            defaultMessage: label || `${item.__collectionUid} ${item.id}`,
          }
        },
        value: item.id,
        label: label,
      })
    });

  const isExternal = form.type === navigationItemType.EXTERNAL;
  const pathSourceName = isExternal ? 'externalPath' : 'path';

  const submitDisabled =
    (form.type === navigationItemType.INTERNAL && !isSingleSelected && isNil(get(form, `${inputsPrefix}related`))) ||
    (form.type === navigationItemType.WRAPPER && isNil(get(form, `${inputsPrefix}title`)));

  const debouncedSearch = useCallback(
    debounce(nextValue => setContentTypeSearchQuery(nextValue), 500),
    [],
  );

  const debounceContentTypeSearchQuery = value => {
    setContentTypeSearchInputValue(value);
    debouncedSearch(value);
  };

  const onChangeRelatedType = ({ target: { name, value } }) => {
    const relatedTypeBeingReverted = data.relatedType && (data.relatedType.value === get(value, 'value', value));
    setContentTypeSearchQuery(undefined);
    setContentTypeSearchInputValue(undefined);
    setFormState(prevState => ({
      ...prevState,
      updated: true,
      related: relatedTypeBeingReverted ? data.related?.value : undefined,
      [name]: value,
    }));
    if (!hasChanged) {
      setChangedState(true);
    }
  };

  const relatedTypeSelectOptions = useMemo(
    () => contentTypes
      .filter((contentType) => {
        if (contentType.isSingle) {
          if (relatedTypeSelectValue && [relatedTypeSelectValue, initialRelatedTypeSelected].includes(contentType.uid)) {
            return true;
          }
          return !usedContentTypesData.some((_) => _.__collectionUid === contentType.uid && _.__collectionUid !== form.relatedType);
        }
        return true;
      })
      .map((item) => ({
        key: get(item, 'uid'),
        metadatas: {
          intlLabel: {
            id: get(item, 'label', get(item, 'name')),
            defaultMessage: get(item, 'label', get(item, 'name')),
          }
        },
        value: get(item, 'uid'),
        label: get(item, 'label', get(item, 'name')),
      })),
    [contentTypes, usedContentTypesData, relatedTypeSelectValue],
  );

  const thereAreNoMoreContentTypes = isEmpty(relatedSelectOptions) && !contentTypeSearchQuery;

  useEffect(
    () => {
      const value = get(relatedSelectOptions, '0');
      if (isSingleSelected && relatedSelectOptions.length === 1 && !isEqual(value, relatedSelectValue)) {
        onChange({ target: { name: relatedFieldName, value } });
      }
    },
    [isSingleSelected, relatedSelectOptions],
  );

  useEffect(() => {
    const value = relatedType;
    if (value) {
      const item = find(
        contentTypes,
        (_) => _.uid === value,
      );
      if (item) {
        getContentTypeEntities({
          modelUID: item.uid,
          query: contentTypeSearchQuery,
          locale,
        }, item.plugin);
      }
    }
  }, [relatedType, contentTypeSearchQuery]);

  const resetCopyItemFormErrors = () => {
    setFormErrorsState((prevState) => ({
      ...prevState,
      [itemLocaleCopyField]: null,
    }));
  }
  const itemLocaleCopyField = `${inputsPrefix}i18n.locale`;
  const itemLocaleCopyValue = form[itemLocaleCopyField];
  const onCopyFromLocale = useCallback(async (event) => {
    event.preventDefault();
    event.stopPropagation();

    setIsLoading(true);
    resetCopyItemFormErrors();

    try {
      const result = await readNavigationItemFromLocale({
        locale: itemLocaleCopyValue,
        structureId: data.structureId
      });

      if (result.type === ResourceState.RESOLVED) {
        const { value: { related, ...rest } } = result;

        setFormState((prevState) => ({
          ...prevState,
          ...rest,
        }));

        if (related) {
          const relatedType = relatedTypeSelectOptions
            .find(({ value }) => value === related.__contentType)?.value;

          setFormState((prevState) => ({
            ...prevState,
            relatedType,
            [relatedFieldName]: related.id,
          }));
        }
      }

      if (result.type === ResourceState.ERROR) {
        setFormErrorsState((prevState) => ({
          ...prevState,
          [itemLocaleCopyField]: getMessage(result.errors[0]),
        }));
      }
    } catch (error) {
        setFormErrorsState((prevState) => ({
          ...prevState,
          [itemLocaleCopyField]: getMessage('popup.item.form.i18n.locale.error.generic'),
        }));
    }

    setIsLoading(false);
  }, [setIsLoading, setFormState, setFormErrorsState]);
  const onChangeLocaleCopy = useCallback(({ target: { value }}) => {
    resetCopyItemFormErrors();
    onChange({ target: { name: itemLocaleCopyField, value } })
  }, [onChange, itemLocaleCopyField]);
  const itemCopyProps = useMemo(() => ({
    intlLabel:{
      id: getTradId('popup.item.form.i18n.locale.label'),
      defaultMessage: 'Copy details from'
    },
    placeholder:{
      id: getTradId('popup.item.form.i18n.locale.placeholder'),
      defaultMessage: 'locale'
    },
  }), [getTradId]);

  return (
    <>
      <Formik>
        <Form>
          <ModalBody>
            <Grid gap={5}>
              <GridItem key={`${inputsPrefix}title`} col={12}>
                <GenericInput
                  autoFocused={true}
                  intlLabel={{
                    id: getTradId('popup.item.form.title.label'),
                    defaultMessage: 'Title',
                  }}
                  name={`${inputsPrefix}title`}
                  placeholder={{
                    id: "e.g. Blog",
                    defaultMessage: 'e.g. Blog',
                  }}
                  description={{
                    id: getTradId('popup.item.form.title.placeholder'),
                    defaultMessage: 'e.g. Blog',
                  }}
                  type='text'
                  error={get(formErrors, `${inputsPrefix}title.id`)}
                  onChange={onChange}
                  value={get(form, `${inputsPrefix}title`, '')}
                />
              </GridItem>
              <GridItem key={`${inputsPrefix}type`} col={4} lg={12}>
                <GenericInput
                  intlLabel={{
                    id: getTradId('popup.item.form.type.label'),
                    defaultMessage: 'Internal link',
                  }}
                  name={`${inputsPrefix}type`}
                  options={navigationItemTypeOptions}
                  type='select'
                  error={get(formErrors, `${inputsPrefix}type.id`)}
                  onChange={onChange}
                  value={get(form, `${inputsPrefix}type`, '')}
                />
              </GridItem>
              <GridItem key={`${inputsPrefix}menuAttached`} col={4} lg={12}>
                <GenericInput
                  intlLabel={{
                    id: getTradId('popup.item.form.menuAttached.label'),
                    defaultMessage: 'MenuAttached',
                  }}
                  name={`${inputsPrefix}menuAttached`}
                  type='bool'
                  error={get(formErrors, `${inputsPrefix}menuAttached.id`)}
                  onChange={onChange}
                  value={get(form, `${inputsPrefix}menuAttached`, '')}
                  disabled={!(data.isMenuAllowedLevel && data.parentAttachedToMenu)}
                />
              </GridItem>
              <GridItem key={`${inputsPrefix}path`} col={12}>
                <GenericInput
                  intlLabel={{
                    id: getTradId(`popup.item.form.${pathSourceName}.label`),
                    defaultMessage: 'Path',
                  }}
                  name={`${inputsPrefix}${pathSourceName}`}
                  placeholder={{
                    id: getTradId(`popup.item.form.${pathSourceName}.placeholder`),
                    defaultMessage: 'e.g. Blog',
                  }}
                  type='text'
                  error={get(formErrors, `${inputsPrefix}${pathSourceName}.id`)}
                  onChange={onChange}
                  value={get(form, `${inputsPrefix}${pathSourceName}`, '')}
                  description={generatePreviewPath()}
                />
              </GridItem>
              {get(form, `${inputsPrefix}type`) === navigationItemType.INTERNAL && (
                <>
                  <GridItem col={6} lg={12}>
                    <GenericInput
                      type="select"
                      intlLabel={{
                        id: getTradId('popup.item.form.relatedType.label'),
                        defaultMessage: 'Related Type'
                      }}
                      placeholder={{
                        id: getTradId('popup.item.form.relatedType.placeholder'),
                        defaultMessage: 'Related Type'
                      }}
                      name={`${inputsPrefix}relatedType`}
                      error={get(formErrors, `${inputsPrefix}relatedType.id`)}
                      onChange={onChangeRelatedType}
                      options={relatedTypeSelectOptions}
                      value={relatedTypeSelectValue}
                      disabled={isLoading || isEmpty(relatedTypeSelectOptions)}
                      description={
                        !isLoading && isEmpty(relatedTypeSelectOptions)
                          ? {
                            id: getTradId('popup.item.form.relatedType.empty'),
                            defaultMessage: 'There are no more content types',
                          }
                          : undefined
                      }
                    />
                  </GridItem>
                  {relatedTypeSelectValue && !isSingleSelected && (
                    <GridItem col={6} lg={12}>
                      <GenericInput
                        type="select"
                        intlLabel={{
                          id: getTradId('popup.item.form.related.label'),
                          defaultMessage: 'Related'
                        }}
                        placeholder={{
                          id: getTradId('popup.item.form.related.label'),
                          defaultMessage: 'Related'
                        }}
                        name={relatedFieldName}
                        error={get(formErrors, `${relatedFieldName}.id`)}
                        onChange={onChange}
                        onInputChange={debounceContentTypeSearchQuery}
                        inputValue={contentTypeSearchInputValue}
                        options={relatedSelectOptions}
                        value={relatedSelectValue}
                        disabled={isLoading || thereAreNoMoreContentTypes}
                        description={
                          !isLoading && thereAreNoMoreContentTypes
                            ? {
                              id: getTradId('popup.item.form.related.empty'),
                              defaultMessage: 'There are no more entities',
                              values: { contentTypeName: relatedTypeSelectValue },
                            }
                            : undefined
                        }
                      />
                    </GridItem>
                  )}
                </>
              )}

              {additionalFields.includes(navigationItemAdditionalFields.AUDIENCE) && (
                <GridItem key={`${inputsPrefix}audience`} col={6} lg={12}>
                  <Select
                    id={`${inputsPrefix}audience`}
                    placeholder={getMessage('popup.item.form.audience.placeholder')}
                    label={getMessage('popup.item.form.audience.label')}
                    onChange={onAudienceChange}
                    value={audience}
                    hint={
                      !isLoading && isEmpty(audienceOptions)
                        ? getMessage('popup.item.form.audience.empty', 'There are no more audiences')
                        : undefined
                    }
                    multi
                    withTags
                    disabled={isEmpty(audienceOptions)}
                  >
                    {audienceOptions.map(({ value, label }) => <Option key={value} value={value}>{label}</Option>)}
                  </Select>
                </GridItem>
              )}
            </Grid>
            {
              isI18nBootstrapAvailable ? (
                <Grid gap={5} paddingTop={5}>
                  <GridItem col={6} lg={12}>
                    <GenericInput
                      {...itemCopyProps}
                      type="select"
                      name={itemLocaleCopyField}
                      error={get(formErrors, itemLocaleCopyField)}
                      onChange={onChangeLocaleCopy}
                      options={availableLocaleOptions}
                      value={itemLocaleCopyValue}
                      disabled={isLoading}
                    />
                  </GridItem>
                  <GridItem col={6} lg={12} paddingTop={6}>
                    <Button
                      variant="tertiary"
                      onClick={onCopyFromLocale}
                      disabled={isLoading || !itemLocaleCopyValue}
                    >
                      {getMessage('popup.item.form.i18n.locale.button')}
                    </Button>
                  </GridItem>
                </Grid>
              ) : null
            }
          </ModalBody>
        </Form>
      </Formik>
      <NavigationItemPopupFooter handleSubmit={handleSubmit} handleCancel={onCancel} submitDisabled={submitDisabled} />
    </>
  );
};

NavigationItemForm.defaultProps = {
  fieldsToDisable: [],
  formErrors: {},
  inputsPrefix: '',
  onSubmit: (e) => e.preventDefault(),
  requestError: null,
};

NavigationItemForm.propTypes = {
  config: PropTypes.object.isRequired,
  availableLocale: PropTypes.arrayOf(PropTypes.string),
  isLoading: PropTypes.bool,
  fieldsToDisable: PropTypes.array,
  formErrors: PropTypes.object.isRequired,
  inputsPrefix: PropTypes.string,
  data: PropTypes.object.isRequired,
  onSubmit: PropTypes.func,
  requestError: PropTypes.object,
  contentTypes: PropTypes.array,
  contentTypeEntities: PropTypes.array,
  usedContentTypeEntities: PropTypes.array,
  availableAudience: PropTypes.array,
  additionalFields: PropTypes.array,
  getContentTypeEntities: PropTypes.func.isRequired,
  appendLabelPublicationStatus: PropTypes.func,
  onCancel: PropTypes.func,
  readNavigationItemFromLocale: PropTypes.func.isRequired,
};

export default NavigationItemForm;
