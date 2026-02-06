import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

// Helper to format YYYY-MM-DD to DD-MM-YYYY
const formatDate = (dateString) => {
  if (!dateString) return '';
  const [year, month, day] = dateString.split('-');
  return `${day}-${month}-${year}`;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#333' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, borderBottom: '2 solid #E2E8F0', paddingBottom: 20 },
  logo: { width: 120, objectFit: 'contain' },
  headerText: { alignItems: 'flex-end' },
  title: { fontSize: 24, fontFamily: 'Helvetica-Bold', color: '#DC2626', textTransform: 'uppercase' },
  subTitle: { fontSize: 10, color: '#64748B' },
  
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#1E293B', borderBottom: '1 solid #E2E8F0', marginBottom: 8, paddingBottom: 4, textTransform: 'uppercase' },
  
  row: { flexDirection: 'row', marginBottom: 6 },
  label: { width: '30%', fontFamily: 'Helvetica-Bold', color: '#64748B' },
  value: { width: '70%', fontFamily: 'Helvetica' },
  
  // Buyer subsection
  buyerSubsection: { marginBottom: 10, marginTop: 5 },
  buyerTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: '#475569', marginBottom: 5 },
  
  // Signature specific styles
  signatureRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, flexWrap: 'wrap' },
  signatureBox: { width: '48%', marginBottom: 15 },
  signatureImage: { height: 50, marginBottom: 5 }, 
  signatureLine: { borderBottom: '1 solid #94A3B8', marginTop: 0 },
  signatureLabel: { fontSize: 8, color: '#64748B', marginTop: 4, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },
  
  // Disclaimer
  disclaimer: { marginTop: 15, padding: 10, backgroundColor: '#FEF2F2', borderLeft: '3 solid #DC2626' },
  disclaimerText: { fontSize: 8, color: '#991B1B', lineHeight: 1.4 }
});

export const OfferPdfDocument = ({ formData, logoUrl }) => {
  const buyers = formData.buyers || [];
  
  // Calculate total deposit
  const initialDepositNum = parseFloat(String(formData.initialDeposit || '0').replace(/[^0-9.]/g, '')) || 0;
  const balanceDepositNum = parseFloat(String(formData.balanceDeposit || '0').replace(/[^0-9.]/g, '')) || 0;
  const totalDeposit = initialDepositNum + balanceDepositNum;
  
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* HEADER - UPDATED TEXT */}
        <View style={styles.header}>
          <Image src={logoUrl} style={styles.logo} />
          <View style={styles.headerText}>
            <Text style={styles.title}>NON-BINDING PROPERTY PURCHASE</Text>
            <Text style={styles.subTitle}>Letter of Offer</Text>
          </View>
        </View>

        {/* PROPERTY DETAILS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Property Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Property Address:</Text>
            <Text style={styles.value}>{formData.propertyAddress}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Agent:</Text>
            <Text style={styles.value}>{formData.agentName}</Text>
          </View>
        </View>

        {/* BUYER DETAILS - Multi-buyer system */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buyer Details</Text>
          
          {buyers.map((buyer, index) => (
            <View key={index} style={styles.buyerSubsection}>
              <Text style={styles.buyerTitle}>Buyer {index + 1}</Text>
              
              {buyer.isEntity ? (
                <>
                  <View style={styles.row}>
                    <Text style={styles.label}>Entity Name:</Text>
                    <Text style={styles.value}>{buyer.entityName}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>ABN:</Text>
                    <Text style={styles.value}>{buyer.abn}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>ACN:</Text>
                    <Text style={styles.value}>{buyer.acn}</Text>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <Text style={styles.label}>Full Name:</Text>
                  <Text style={styles.value}>
                    {buyer.firstName} {buyer.middleName ? buyer.middleName + ' ' : ''}{buyer.surname}
                  </Text>
                </View>
              )}
              
              <View style={styles.row}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{buyer.email}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Phone:</Text>
                <Text style={styles.value}>{buyer.phone}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Address:</Text>
                <Text style={styles.value}>{buyer.address}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* SOLICITOR DETAILS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Buyer's Solicitor</Text>
          
          {formData.solicitorToBeAdvised ? (
            <View style={styles.row}>
              <Text style={styles.label}>Status:</Text>
              <Text style={styles.value}>Solicitor: To Be Advised</Text>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Company:</Text>
                <Text style={styles.value}>{formData.solicitorCompany || 'Not provided'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Contact Person:</Text>
                <Text style={styles.value}>{formData.solicitorContact || 'Not provided'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Email:</Text>
                <Text style={styles.value}>{formData.solicitorEmail}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Phone:</Text>
                <Text style={styles.value}>{formData.solicitorPhone}</Text>
              </View>
            </>
          )}
        </View>

        {/* PRICE & DEPOSIT - Two-stage deposits */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Price & Deposit</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Purchase Price:</Text>
            <Text style={styles.value}>${formData.purchasePrice}</Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Initial Deposit:</Text>
            <Text style={styles.value}>${formData.initialDeposit}</Text>
          </View>
          <View style={{ marginLeft: '30%', marginBottom: 6 }}>
            <Text style={{ fontSize: 8, color: '#64748B', fontStyle: 'italic' }}>
              Payable immediately upon contract date
            </Text>
          </View>
          
          <View style={styles.row}>
            <Text style={styles.label}>Balance Deposit:</Text>
            <Text style={styles.value}>${formData.balanceDeposit}</Text>
          </View>
          {formData.balanceDepositTerms && (
            <View style={{ marginLeft: '30%', marginBottom: 6 }}>
              <Text style={{ fontSize: 8, color: '#64748B', fontStyle: 'italic' }}>
                {formData.balanceDepositTerms}
              </Text>
            </View>
          )}
          
          <View style={styles.row}>
            <Text style={styles.label}>Total Deposit:</Text>
            <Text style={{ ...styles.value, fontFamily: 'Helvetica-Bold' }}>
              ${totalDeposit.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* CONDITIONS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conditions</Text>
          
          {formData.waiverCoolingOff && (
            <View style={styles.row}>
              <Text style={styles.label}>Cooling Off Period:</Text>
              <Text style={{ ...styles.value, fontFamily: 'Helvetica-Bold', color: '#DC2626' }}>
                WAIVED
              </Text>
            </View>
          )}
          
          <View style={styles.row}>
            <Text style={styles.label}>Finance Date:</Text>
            <Text style={styles.value}>
              {formData.financeDate} {formData.financePreApproved ? '(Pre-Approved)' : ''}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Building & Pest:</Text>
            <Text style={styles.value}>{formData.inspectionDate || 'Not specified'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Settlement Date:</Text>
            <Text style={styles.value}>{formData.settlementDate || 'Not specified'}</Text>
          </View>
          {formData.specialConditions && (
            <View style={{ marginTop: 5 }}>
              <Text style={styles.label}>Special Conditions:</Text>
              <Text style={{ ...styles.value, width: '100%', marginTop: 2 }}>
                {formData.specialConditions}
              </Text>
            </View>
          )}
        </View>

        {/* SIGNATURE SECTION - Multi-buyer signatures with break="false" to prevent splitting */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Authorisation</Text>
          
          <View style={styles.signatureRow}>
            {buyers.map((buyer, index) => (
              <View key={index} style={styles.signatureBox}>
                {buyer.signature ? (
                  <Image src={buyer.signature} style={styles.signatureImage} />
                ) : (
                  <View style={{ height: 50 }} /> 
                )}
                <View style={styles.signatureLine} />
                <Text style={styles.signatureLabel}>
                  {buyer.isEntity ? buyer.entityName : `${buyer.firstName} ${buyer.surname}`} - Signature
                </Text>
                <Text style={{ fontSize: 8, marginTop: 2 }}>
                  Date: {formatDate(buyer.signatureDate)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* NON-BINDING DISCLAIMER */}
        <View style={styles.disclaimer} wrap={false}>
          <Text style={styles.disclaimerText}>
            IMPORTANT NOTICE: This document is a non-binding expression of interest only and does not constitute a 
            legally binding contract. Any offer to purchase is subject to the execution of a formal contract of sale 
            and completion of all necessary legal requirements. Both parties reserve the right to withdraw at any time 
            prior to exchange of contracts.
          </Text>
        </View>

      </Page>
    </Document>
  );
};