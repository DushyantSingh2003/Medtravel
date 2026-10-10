'use client';

import {
  Button,
  Checkbox,
  Combobox,
  CurrencyInput,
  DatePicker,
  Input,
  Label,
  PhoneInput,
  Radio,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  formatMinorUnits,
} from '@medtravel/ui';
import type { Locale } from '@medtravel/contracts';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { datePickerLabels } from './date-labels';
import { Section } from './section';

export function InputSections({ locale }: { locale: Locale }) {
  const t = useTranslations('gallery');
  const [city, setCity] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>();
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [plan, setPlan] = useState('standard');

  const cities = ['delhi', 'mumbai', 'chennai', 'bengaluru', 'hyderabad', 'kolkata'].map(
    (value) => ({
      value,
      label: t(`cities.${value}`),
    }),
  );

  return (
    <>
      <Section id="button" title={t('sections.button')} description={t('descriptions.button')}>
        <div className="flex flex-wrap items-center gap-2">
          <Button>{t('button.primary')}</Button>
          <Button variant="secondary">{t('button.secondary')}</Button>
          <Button variant="outline">{t('button.outline')}</Button>
          <Button variant="ghost">{t('button.ghost')}</Button>
          <Button variant="destructive">{t('button.destructive')}</Button>
          <Button variant="link">{t('button.link')}</Button>
          <Button loading aria-label={t('button.loading')}>
            {t('button.loading')}
          </Button>
          <Button disabled>{t('button.disabled')}</Button>
          <Button size="sm">{t('button.small')}</Button>
          <Button size="lg">
            <Mail aria-hidden="true" />
            {t('button.withIcon')}
          </Button>
        </div>
      </Section>

      <Section
        id="form-controls"
        title={t('sections.formControls')}
        description={t('descriptions.formControls')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="g-input">{t('formControls.name')}</Label>
            <Input
              id="g-input"
              placeholder={t('formControls.namePlaceholder')}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-email">{t('formControls.email')}</Label>
            <Input id="g-email" type="email" defaultValue="patient@example.com" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-invalid">{t('formControls.invalid')}</Label>
            <Input
              id="g-invalid"
              aria-invalid="true"
              defaultValue="x"
              aria-describedby="g-invalid-msg"
            />
            <p id="g-invalid-msg" className="text-xs font-medium text-destructive">
              {t('formControls.invalidMessage')}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="g-disabled">{t('formControls.disabled')}</Label>
            <Input id="g-disabled" disabled defaultValue={t('formControls.disabledValue')} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="g-textarea">{t('formControls.notes')}</Label>
            <Textarea id="g-textarea" placeholder={t('formControls.notesPlaceholder')} />
          </div>
        </div>
      </Section>

      <Section id="select" title={t('sections.select')} description={t('descriptions.select')}>
        <div className="max-w-xs">
          <Select defaultValue="en">
            <SelectTrigger aria-label={t('select.label')}>
              <SelectValue placeholder={t('select.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('select.english')}</SelectItem>
              <SelectItem value="ar">{t('select.arabic')}</SelectItem>
              <SelectItem value="fr">{t('select.french')}</SelectItem>
              <SelectItem value="ru">{t('select.russian')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section
        id="combobox"
        title={t('sections.combobox')}
        description={t('descriptions.combobox')}
      >
        <div className="max-w-xs">
          <Combobox
            options={cities}
            value={city}
            onChange={setCity}
            placeholder={t('combobox.placeholder')}
            searchPlaceholder={t('combobox.search')}
            emptyLabel={t('combobox.empty')}
            aria-label={t('combobox.label')}
          />
        </div>
      </Section>

      <Section
        id="date-picker"
        title={t('sections.datePicker')}
        description={t('descriptions.datePicker')}
      >
        <div className="max-w-xs">
          <DatePicker
            value={date}
            onChange={setDate}
            locale={locale}
            placeholder={t('datePicker.placeholder')}
            labels={datePickerLabels(t)}
            aria-label={t('datePicker.label')}
          />
        </div>
      </Section>

      <Section
        id="phone-input"
        title={t('sections.phoneInput')}
        description={t('descriptions.phoneInput')}
      >
        <div className="max-w-md space-y-2">
          <PhoneInput
            value={phone}
            onChange={setPhone}
            locale={locale}
            labels={{
              country: t('phone.country'),
              searchCountry: t('phone.search'),
              noCountry: t('phone.none'),
            }}
            aria-label={t('phone.number')}
          />
          <p className="text-sm text-muted-foreground" dir="ltr">
            {t('phone.value')}: <output data-testid="phone-value">{phone || '—'}</output>
          </p>
        </div>
      </Section>

      <Section
        id="currency-input"
        title={t('sections.currencyInput')}
        description={t('descriptions.currencyInput')}
      >
        <div className="max-w-md space-y-2">
          <div className="flex gap-2">
            <Select
              value={currency}
              onValueChange={(value) => {
                setCurrency(value);
                setAmount(null);
              }}
            >
              <SelectTrigger className="w-28" aria-label={t('currency.currency')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['USD', 'INR', 'JPY', 'KWD'].map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1">
              <CurrencyInput
                value={amount}
                onChange={setAmount}
                currency={currency}
                locale={locale}
                aria-label={t('currency.amount')}
              />
            </div>
          </div>
          <p className="text-sm text-muted-foreground" dir="ltr">
            {t('currency.stored')}:{' '}
            <output data-testid="currency-minor">{amount === null ? '—' : amount}</output>
            {amount === null ? null : <span> ({formatMinorUnits(amount, currency, locale)})</span>}
          </p>
        </div>
      </Section>

      <Section
        id="selection-controls"
        title={t('sections.selectionControls')}
        description={t('descriptions.selectionControls')}
      >
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <Checkbox id="g-check" defaultChecked />
            <Label htmlFor="g-check" className="font-normal">
              {t('selection.checkbox')}
            </Label>
          </div>
          <RadioGroup value={plan} onValueChange={setPlan} aria-label={t('selection.radioGroup')}>
            {['basic', 'standard', 'premium'].map((value) => (
              <div key={value} className="flex items-center gap-2">
                <Radio id={`g-radio-${value}`} value={value} />
                <Label htmlFor={`g-radio-${value}`} className="font-normal">
                  {t(`selection.plans.${value}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <div className="flex items-center gap-2">
            <Switch id="g-switch" defaultChecked />
            <Label htmlFor="g-switch" className="font-normal">
              {t('selection.switch')}
            </Label>
          </div>
        </div>
      </Section>
    </>
  );
}
